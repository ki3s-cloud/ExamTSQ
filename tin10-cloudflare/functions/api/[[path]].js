import {Q,E} from '../../questions.js';
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const now=()=>Date.now();
const rand=()=>crypto.randomUUID();
const hash=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const enc=x=>btoa(String.fromCharCode(...new TextEncoder().encode(x))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const sign=async (x,secret)=>{const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return enc(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(x)))))};
const shuffled=n=>{const a=Array.from({length:n},(_,i)=>i);for(let i=n-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
const parse=(s,f=[])=>{try{return JSON.parse(s)}catch{return f}};
const cookie=r=>(r.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('tin_admin='))?.slice(10)||'';
async function admin(r,secret){const c=cookie(r),[expiry,sig]=c.split('.');return !!(expiry&&sig&&Number(expiry)>now()&&sig===await sign(expiry,secret))}
const publicState=s=>({open:!!s.open&&now()<s.closes_at,closesAt:s.closes_at,duration:s.duration,sessionId:s.session_id});
async function attempt(db,r,s){const token=r.headers.get('x-student-token')||'';if(!token)return null;const h=await hash(token);return db.prepare('SELECT * FROM attempts WHERE token_hash=? AND session_id=?').bind(h,s.session_id).first()}
async function finalize(db,a){if(a.status==='done')return a;const answers=parse(a.answers),qord=parse(a.question_order),opts=parse(a.option_orders);let score=0;for(let i=0;i<qord.length;i++){const v=answers[i];if(Number.isInteger(v)&&v>=0&&v<4&&opts[i][v]===0)score++}const at=now();await db.prepare("UPDATE attempts SET status='done',score=?,submitted_at=?,updated_at=? WHERE id=? AND status='doing'").bind(score,at,at,a.id).run();return {...a,status:'done',score,submitted_at:at}}
function viewAttempt(a){const qo=parse(a.question_order),oo=parse(a.option_orders);return {id:a.id,name:a.name,className:a.class_name,code:a.student_code,status:a.status,startedAt:a.started_at,deadline:a.deadline,answers:parse(a.answers),essays:parse(a.essays),answered:a.answered,score:a.status==='done'?a.score:null,essayScores:parse(a.essay_scores),submittedAt:a.submitted_at,questions:qo.map((qi,i)=>({text:Q[qi][0],options:oo[i].map(oi=>Q[qi][oi+1])})),essayQuestions:E.map(x=>x[0])}}
export async function onRequest({request:r,env}){
try{
if(!env.DB)return json({error:'Chưa cấu hình D1.'},503);
const url=new URL(r.url),path=url.pathname.replace(/^\/api\/?/,'');const db=env.DB;
const s=await db.prepare('SELECT * FROM settings WHERE id=1').first();if(!s)return json({error:'Chưa khởi tạo cơ sở dữ liệu.'},503);
const body=r.method==='POST'?await r.json().catch(()=>({})):{};
if(path==='state'&&r.method==='GET')return json(publicState(s));
if(path==='admin/login'&&r.method==='POST'){
if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET||env.SESSION_SECRET.length<24)return json({error:'Chưa cấu hình ADMIN_PASSWORD / SESSION_SECRET.'},503);
if(typeof body.password!=='string'||(await hash(body.password))!==(await hash(env.ADMIN_PASSWORD)))return json({error:'Mật khẩu không đúng.'},401);
const expiry=String(now()+8*3600000);return json({ok:true},200,{'set-cookie':`tin_admin=${expiry}.${await sign(expiry,env.SESSION_SECRET)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`});}
if(path==='admin/logout'&&r.method==='POST')return json({ok:true},200,{'set-cookie':'tin_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
if(path.startsWith('admin/')){
if(!env.SESSION_SECRET||!(await admin(r,env.SESSION_SECRET)))return json({error:'Cần đăng nhập giáo viên.'},401);
if(path==='admin/state'&&r.method==='GET')return json({...publicState(s),openedAt:s.opened_at});
if(path==='admin/open'&&r.method==='POST'){
if(s.open&&now()<s.closes_at)return json({error:'Ca thi đang mở.'},409);
const minutes=Number(body.minutes||45),duration=Number(body.duration||20);
if(!Number.isInteger(minutes)||minutes<5||minutes>240||!Number.isInteger(duration)||duration<5||duration>120)return json({error:'Thời gian không hợp lệ.'},400);
const id=rand(),t=now();await db.prepare('UPDATE settings SET open=1,session_id=?,opened_at=?,closes_at=?,duration=? WHERE id=1').bind(id,t,t+minutes*60000,duration*60).run();return json({ok:true});}
if(path==='admin/close'&&r.method==='POST'){await db.prepare('UPDATE settings SET open=0,closes_at=? WHERE id=1').bind(now()).run();return json({ok:true});}
if(path==='admin/results'&&r.method==='GET'){
const rows=await db.prepare('SELECT id,student_code,name,class_name,started_at,deadline,status,answered,score,essay_scores,essays,answers,question_order,option_orders,submitted_at FROM attempts WHERE session_id=? ORDER BY started_at').bind(s.session_id).all();
const list=[];for(let a of rows.results){if(a.status==='doing'&&(now()>=a.deadline||!s.open||now()>=s.closes_at))a=await finalize(db,a);list.push({id:a.id,code:a.student_code,name:a.name,className:a.class_name,status:a.status,answered:a.answered,score:a.score,essayScores:parse(a.essay_scores),essays:parse(a.essays),answers:parse(a.answers),questionOrder:parse(a.question_order),optionOrders:parse(a.option_orders),startedAt:a.started_at,submittedAt:a.submitted_at,used:a.submitted_at?Math.round((a.submitted_at-a.started_at)/1000):null})}return json({state:publicState(s),results:list,essayQuestions:E,questions:Q});}
if(path==='admin/grade'&&r.method==='POST'){
const scores=body.scores;if(!Array.isArray(scores)||scores.length!==E.length||scores.some((x,i)=>typeof x!=='number'||!Number.isFinite(x)||x<0||x>E[i][2]))return json({error:'Điểm tự luận không hợp lệ.'},400);
const a=await db.prepare('SELECT id,status FROM attempts WHERE id=? AND session_id=?').bind(String(body.id||''),s.session_id).first();if(!a||a.status!=='done')return json({error:'Không tìm thấy bài đã nộp.'},404);
await db.prepare('UPDATE attempts SET essay_scores=?,updated_at=? WHERE id=?').bind(JSON.stringify(scores),now(),a.id).run();return json({ok:true});}
return json({error:'Không tìm thấy chức năng.'},404);}
if(path==='start'&&r.method==='POST'){
if(!s.open||now()>=s.closes_at)return json({error:'Ca thi chưa mở hoặc đã hết giờ.'},409);
const name=String(body.name||'').trim().replace(/\s+/g,' '),cls=String(body.className||'').trim().toUpperCase(),code=String(body.code||'').trim().toUpperCase();
if(name.length<2||name.length>60||cls.length<2||cls.length>15||!/^[A-Z0-9_-]{3,30}$/.test(code))return json({error:'Kiểm tra họ tên, lớp và mã học sinh (3–30 ký tự, chữ/số/_/-).'},400);
const token=rand()+rand(),qo=shuffled(Q.length),oo=qo.map(()=>shuffled(4)),t=now(),deadline=Math.min(t+s.duration*1000,s.closes_at),id=rand();
try{await db.prepare('INSERT INTO attempts(id,session_id,student_code,name,class_name,token_hash,started_at,deadline,question_order,option_orders,answers,essays,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,s.session_id,code,name,cls,await hash(token),t,deadline,JSON.stringify(qo),JSON.stringify(oo),JSON.stringify(Array(Q.length).fill(-1)),JSON.stringify(Array(E.length).fill('')),t).run()}catch{return json({error:'Mã học sinh đã tham gia ca thi này. Nếu đang làm, hãy mở lại bằng cùng trình duyệt.'},409)}
const a=await db.prepare('SELECT * FROM attempts WHERE id=?').bind(id).first();return json({token,attempt:viewAttempt(a)});}
if(path==='resume'&&r.method==='GET'){
let a=await attempt(db,r,s);if(!a)return json({error:'Không tìm thấy phiên làm bài trên thiết bị này.'},404);
if(a.status==='doing'&&(now()>=a.deadline||!s.open||now()>=s.closes_at))a=await finalize(db,a);return json({attempt:viewAttempt(a)});}
if(path==='save'&&r.method==='POST'){
const a=await attempt(db,r,s);if(!a)return json({error:'Phiên đăng nhập không hợp lệ.'},401);
if(a.status!=='doing'||!s.open||now()>=a.deadline||now()>=s.closes_at)return json({error:'Bài đã khóa hoặc hết giờ.',closed:true},409);
const ans=body.answers,ess=body.essays;
if(!Array.isArray(ans)||ans.length!==Q.length||ans.some(x=>!Number.isInteger(x)||x< -1||x>3)||!Array.isArray(ess)||ess.length!==E.length||ess.some(x=>typeof x!=='string'||x.length>3000))return json({error:'Dữ liệu bài làm không hợp lệ.'},400);
const count=ans.filter(x=>x>=0).length;
await db.prepare("UPDATE attempts SET answers=?,essays=?,answered=?,updated_at=? WHERE id=? AND status='doing'").bind(JSON.stringify(ans),JSON.stringify(ess),count,now(),a.id).run();return json({ok:true,savedAt:now()});}
if(path==='submit'&&r.method==='POST'){
let a=await attempt(db,r,s);if(!a)return json({error:'Phiên không hợp lệ.'},401);
if(a.status==='done')return json({ok:true,attempt:viewAttempt(a)});
if(now()<a.deadline&&s.open&&now()<s.closes_at){const ans=body.answers,ess=body.essays;if(!Array.isArray(ans)||ans.length!==Q.length||ans.some(x=>!Number.isInteger(x)||x< -1||x>3)||!Array.isArray(ess)||ess.length!==E.length||ess.some(x=>typeof x!=='string'||x.length>3000))return json({error:'Dữ liệu bài làm không hợp lệ.'},400);await db.prepare("UPDATE attempts SET answers=?,essays=?,answered=?,updated_at=? WHERE id=? AND status='doing'").bind(JSON.stringify(ans),JSON.stringify(ess),ans.filter(x=>x>=0).length,now(),a.id).run();a=await db.prepare('SELECT * FROM attempts WHERE id=?').bind(a.id).first()}
a=await finalize(db,a);return json({ok:true,attempt:viewAttempt(a)});}
return json({error:'Không tìm thấy API.'},404);
}catch(e){return json({error:'Có lỗi máy chủ. Vui lòng thử lại hoặc báo giáo viên.'},500)}
}
