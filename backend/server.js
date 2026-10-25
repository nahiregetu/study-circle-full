const express=require('express'),{Pool}=require('pg'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),
multer=require('multer'),path=require('path'),fs=require('fs'),crypto=require('crypto');
const DBURL=process.env.DATABASE_URL||'';
// Hosted databases (Render, Neon, Railway...) require SSL; local/Docker ones do not. Override with PGSSL=false|true.
const useSSL=process.env.PGSSL?process.env.PGSSL==='true':!/@(localhost|127\.0\.0\.1|db)[:\/]/.test(DBURL);
const db=new Pool({connectionString:DBURL,ssl:useSSL?{rejectUnauthorized:false}:false});
if(!DBURL)console.error('DATABASE_URL is not set!');
const SECRET=process.env.JWT_SECRET||'dev-secret-change-me';
let UP=process.env.UPLOAD_DIR||'/data/uploads';
try{fs.mkdirSync(UP,{recursive:true})}catch(e){UP=path.join(require('os').tmpdir(),'uploads');fs.mkdirSync(UP,{recursive:true});console.warn('Upload dir not writable, using',UP,'(files will be lost on restart)')}
const app=express();app.use(express.json());app.use(express.static(path.join(__dirname,'public')));
const q=(t,p)=>db.query(t,p).then(r=>r.rows);
const wrap=f=>(a,b,n)=>Promise.resolve(f(a,b)).catch(n);
const auth=(a,b,n)=>{try{a.user=jwt.verify((a.headers.authorization||'').replace('Bearer ',''),SECRET);n()}catch{b.status(401).json({error:'Please log in'})}};
const pts=(u,n)=>q('UPDATE users SET points=points+$1 WHERE id=$2',[n,u]);
const today=()=>new Date(Date.now()+3*36e5).toISOString().slice(0,10); // Ethiopia = UTC+3
const token=u=>jwt.sign({id:u.id,name:u.name},SECRET,{expiresIn:'30d'});
const bad=(s,m)=>s.status(400).json({error:m});

// ---- Auth ----
app.post('/api/register',wrap(async(a,b)=>{
 const{name,email,password,school}=a.body;
 if(!name||!email||!password||password.length<6)return bad(b,'Name, email and a password of 6+ characters are required');
 if((await q('SELECT 1 FROM users WHERE email=$1',[email.toLowerCase()])).length)return bad(b,'Email already registered');
 const[u]=await q('INSERT INTO users(name,email,password_hash,school) VALUES($1,$2,$3,$4) RETURNING id,name',[name,email.toLowerCase(),await bcrypt.hash(password,10),school||null]);
 b.json({token:token(u),user:u});
}));
app.post('/api/login',wrap(async(a,b)=>{
 const[u]=await q('SELECT * FROM users WHERE email=$1',[(a.body.email||'').toLowerCase()]);
 if(!u||!(await bcrypt.compare(a.body.password||'',u.password_hash)))return b.status(401).json({error:'Wrong email or password'});
 b.json({token:token(u),user:{id:u.id,name:u.name,points:u.points}});
}));
app.get('/api/me',auth,wrap(async(a,b)=>b.json((await q('SELECT id,name,email,school,points FROM users WHERE id=$1',[a.user.id]))[0])));

// ---- Squads & streaks ----
async function streak(sid,need){
 const m=Object.fromEntries((await q('SELECT day::text d,count(*)::int c FROM checkins WHERE squad_id=$1 GROUP BY day',[sid])).map(r=>[r.d,r.c]));
 const k=x=>x.toISOString().slice(0,10);
 let d=new Date(Date.now()+3*36e5),n=0;
 if((m[k(d)]||0)<need)d.setDate(d.getDate()-1); // today not met yet: streak is still alive until midnight
 while((m[k(d)]||0)>=need){n++;d.setDate(d.getDate()-1)}
 // best streak ever: longest run of consecutive days that met the target
 const days=Object.keys(m).filter(x=>m[x]>=need).sort();let best=0,run=0,prev=null;
 for(const x of days){run=prev&&(new Date(x)-new Date(prev))===864e5?run+1:1;best=Math.max(best,run);prev=x}
 return{n,best:Math.max(best,n)};
}
async function weekDays(uid){ // Mon..Sun of the current week: did this user check in?
 const now=new Date(Date.now()+3*36e5),dow=(now.getUTCDay()+6)%7,k=x=>x.toISOString().slice(0,10);
 const mon=new Date(now);mon.setUTCDate(mon.getUTCDate()-dow);
 const rows=new Set((await q('SELECT DISTINCT day::text d FROM checkins WHERE user_id=$1 AND day>=$2',[uid,k(mon)])).map(r=>r.d));
 return Array.from({length:7},(_,i)=>{const x=new Date(mon);x.setUTCDate(x.getUTCDate()+i);return{on:rows.has(k(x)),today:i===dow}});
}
const code=()=>crypto.randomBytes(3).toString('hex').toUpperCase();
app.post('/api/squads',auth,wrap(async(a,b)=>{
 if(!a.body.name)return bad(b,'Squad name required');
 const[s]=await q('INSERT INTO squads(name,invite_code,owner_id) VALUES($1,$2,$3) RETURNING *',[a.body.name,code(),a.user.id]);
 await q('INSERT INTO members VALUES($1,$2)',[s.id,a.user.id]);b.json(s);
}));
app.post('/api/squads/join',auth,wrap(async(a,b)=>{
 const[s]=await q('SELECT * FROM squads WHERE invite_code=$1',[(a.body.code||'').toUpperCase()]);
 if(!s)return b.status(404).json({error:'Invalid invite code'});
 if((await q('SELECT count(*)::int c FROM members WHERE squad_id=$1',[s.id]))[0].c>=10)return bad(b,'Squad is full (max 10)');
 await q('INSERT INTO members VALUES($1,$2) ON CONFLICT DO NOTHING',[s.id,a.user.id]);b.json(s);
}));
app.get('/api/squads/mine',auth,wrap(async(a,b)=>{
 const out=[];
 for(const s of await q('SELECT s.* FROM squads s JOIN members m ON m.squad_id=s.id WHERE m.user_id=$1',[a.user.id])){
  const members=await q('SELECT u.id,u.name,u.school,u.points,(c.user_id IS NOT NULL) AS checked_in FROM members m JOIN users u ON u.id=m.user_id LEFT JOIN checkins c ON c.squad_id=m.squad_id AND c.user_id=u.id AND c.day=$2 WHERE m.squad_id=$1',[s.id,today()]);
  const need=Math.max(1,Math.ceil(members.length*0.8)); // e.g. 4 of 5
  const st=await streak(s.id,need);
  out.push({...s,members,need,checkedToday:members.filter(m=>m.checked_in).length,streak:st.n,best:st.best,week:await weekDays(a.user.id)});
 }
 b.json(out);
}));
app.post('/api/squads/:id/checkin',auth,wrap(async(a,b)=>{
 if(!(await q('SELECT 1 FROM members WHERE squad_id=$1 AND user_id=$2',[a.params.id,a.user.id])).length)return b.status(403).json({error:'Not in this squad'});
 const r=await q('INSERT INTO checkins VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1',[a.params.id,a.user.id,today()]);
 if(r.length)await pts(a.user.id,20);
 b.json({ok:true,newCheckin:r.length>0});
}));


// ---- Leave squad, nudges, focus sessions ----
app.post('/api/squads/:id/leave',auth,wrap(async(a,b)=>{await q('DELETE FROM members WHERE squad_id=$1 AND user_id=$2',[a.params.id,a.user.id]);b.json({ok:true})}));
app.post('/api/squads/:id/nudge/:uid',auth,wrap(async(a,b)=>{
 const ok=await q('SELECT count(*)::int c FROM members WHERE squad_id=$1 AND user_id IN($2,$3)',[a.params.id,a.user.id,a.params.uid]);
 if(ok[0].c<2||+a.params.uid===a.user.id)return b.status(403).json({error:'You can only nudge a squad mate'});
 if((await q("SELECT 1 FROM nudges WHERE from_id=$1 AND to_id=$2 AND created_at>now()-interval '1 hour'",[a.user.id,a.params.uid])).length)return bad(b,'You already nudged them recently');
 await q('INSERT INTO nudges(squad_id,from_id,to_id) VALUES($1,$2,$3)',[a.params.id,a.user.id,a.params.uid]);b.json({ok:true});
}));
app.get('/api/nudges',auth,wrap(async(a,b)=>b.json(await q("SELECT n.id,u.name AS from_name FROM nudges n JOIN users u ON u.id=n.from_id WHERE n.to_id=$1 AND n.seen=false AND n.created_at>now()-interval '1 day' ORDER BY n.id DESC",[a.user.id]))));
app.post('/api/nudges/seen',auth,wrap(async(a,b)=>{await q('UPDATE nudges SET seen=true WHERE to_id=$1',[a.user.id]);b.json({ok:true})}));
const lastSession={};
app.post('/api/sessions',auth,wrap(async(a,b)=>{ // focus session finished: +15 pts, at most once per 10 minutes
 const now=Date.now();if(now-(lastSession[a.user.id]||0)<600000)return bad(b,'Session already counted');
 lastSession[a.user.id]=now;await pts(a.user.id,15);b.json({ok:true});
}));

// ---- Daily tasks ----
app.get('/api/tasks',auth,wrap(async(a,b)=>b.json(await q('SELECT id,title,done FROM tasks WHERE user_id=$1 AND day=$2 ORDER BY id',[a.user.id,today()]))));
app.post('/api/tasks',auth,wrap(async(a,b)=>{
 if(!a.body.title)return bad(b,'Title required');
 b.json((await q('INSERT INTO tasks(user_id,title,day) VALUES($1,$2,$3) RETURNING id,title,done',[a.user.id,a.body.title,today()]))[0]);
}));
app.patch('/api/tasks/:id',auth,wrap(async(a,b)=>{
 const[t]=await q('UPDATE tasks SET done=NOT done WHERE id=$1 AND user_id=$2 RETURNING id,title,done',[a.params.id,a.user.id]);
 if(!t)return b.status(404).json({error:'Not found'});
 if(t.done)await pts(a.user.id,5);b.json(t);
}));
app.delete('/api/tasks/:id',auth,wrap(async(a,b)=>{await q('DELETE FROM tasks WHERE id=$1 AND user_id=$2',[a.params.id,a.user.id]);b.json({ok:true})}));

// ---- Exam library (file upload + sharing) ----
const ALLOWED={'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png'};
const upload=multer({limits:{fileSize:10*1024*1024},
 storage:multer.diskStorage({destination:UP,filename:(a,f,cb)=>cb(null,crypto.randomUUID()+(ALLOWED[f.mimetype]||''))}),
 fileFilter:(a,f,cb)=>cb(ALLOWED[f.mimetype]?null:new Error('Only PDF, JPG or PNG files are allowed'),!!ALLOWED[f.mimetype])});
app.post('/api/resources',auth,upload.single('file'),wrap(async(a,b)=>{
 const{title,grade,subject,unit,kind,school}=a.body;
 if(!a.file)return bad(b,'Please attach a file');
 if(!title||!(+grade>=9&&+grade<=12)||!subject||!kind){fs.unlink(a.file.path,()=>{});return bad(b,'Title, grade (9-12), subject and type are required')}
 const[r]=await q('INSERT INTO resources(user_id,title,grade,subject,unit,kind,school,filename,original_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[a.user.id,title,+grade,subject,unit||null,kind,school||null,a.file.filename,a.file.originalname]);
 await pts(a.user.id,15);b.json(r);
}));
app.get('/api/resources',wrap(async(a,b)=>{
 const w=[],p=[];
 for(const f of['grade','subject','unit','kind'])if(a.query[f]){p.push(a.query[f]);w.push(`r.${f}=$${p.length}`)}
 b.json(await q(`SELECT r.id,r.title,r.grade,r.subject,r.unit,r.kind,r.school,r.downloads,r.created_at,u.name AS shared_by FROM resources r JOIN users u ON u.id=r.user_id ${w.length?'WHERE '+w.join(' AND '):''} ORDER BY r.created_at DESC LIMIT 100`,p));
}));
app.get('/api/resources/:id/download',wrap(async(a,b)=>{
 const[r]=await q('UPDATE resources SET downloads=downloads+1 WHERE id=$1 RETURNING filename,original_name',[a.params.id]);
 if(!r)return b.status(404).json({error:'Not found'});
 b.download(path.join(UP,r.filename),r.original_name||r.filename);
}));

// ---- Community Q&A ----
app.get('/api/posts',wrap(async(a,b)=>{
 const posts=await q('SELECT p.*,u.name AS by FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 50');
 const reps=await q('SELECT r.*,u.name AS by FROM replies r JOIN users u ON u.id=r.user_id WHERE r.post_id=ANY($1) ORDER BY r.created_at',[posts.map(p=>p.id)]);
 b.json(posts.map(p=>({...p,replies:reps.filter(r=>r.post_id===p.id)})));
}));
app.post('/api/posts',auth,wrap(async(a,b)=>{
 if(!a.body.question||!a.body.subject)return bad(b,'Subject and question required');
 b.json((await q('INSERT INTO posts(user_id,subject,question) VALUES($1,$2,$3) RETURNING *',[a.user.id,a.body.subject,a.body.question]))[0]);
}));
app.post('/api/posts/:id/replies',auth,wrap(async(a,b)=>{
 if(!a.body.body)return bad(b,'Reply text required');
 const r=(await q('INSERT INTO replies(post_id,user_id,body) VALUES($1,$2,$3) RETURNING *',[a.params.id,a.user.id,a.body.body]))[0];
 await pts(a.user.id,10);b.json(r);
}));

// ---- Leaderboard (squads ranked by total member points) ----
app.get('/api/leaderboard',wrap(async(a,b)=>b.json(await q('SELECT s.id,s.name,COALESCE(SUM(u.points),0)::int AS points,count(m.user_id)::int AS members FROM squads s LEFT JOIN members m ON m.squad_id=s.id LEFT JOIN users u ON u.id=m.user_id GROUP BY s.id ORDER BY points DESC LIMIT 20'))));

app.use((e,a,b,n)=>{console.error(e.message);b.status(e.message&&/allowed|large/i.test(e.message)?400:500).json({error:e.message||'Server error'})});
(async()=>{
 for(let i=0;i<20;i++){try{await db.query(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));break}catch(e){console.log('Waiting for database...',e.message);await new Promise(r=>setTimeout(r,2000))}}
 app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Study Circle API on :'+(process.env.PORT||3000)));
})();
