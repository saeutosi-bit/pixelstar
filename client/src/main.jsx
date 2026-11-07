import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { Activity, ArrowDownLeft, ArrowLeft, ArrowUpRight, AtSign, Check, ChevronDown, CircleHelp, Command, Compass, Hash, LogOut, Menu, MessageCircle, Moon, MoreHorizontal, Plus, Search, Send, Settings, Shield, Sparkles, Sun, Users, X } from 'lucide-react';
import './style.css';

const API = '/api';
const getStored = () => { try { return JSON.parse(localStorage.getItem('ps-session') || 'null'); } catch { return null; } };
function App() {
  const [session,setSession] = useState(getStored);
  const [theme,setTheme] = useState(localStorage.getItem('ps-theme') || 'auto');
  const [page,setPage] = useState('messages');
  const [conversations,setConversations] = useState([]);
  const [active,setActive] = useState(null);
  const [messages,setMessages] = useState([]);
  const [text,setText] = useState('');
  const [search,setSearch] = useState('');
  const [matches,setMatches] = useState([]);
  const [modal,setModal] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [mobileNav,setMobileNav] = useState(false);
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const token = session?.token;
  const user = session?.user;

  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  },[theme]);
  useEffect(() => { localStorage.setItem('ps-theme',theme); },[theme]);
  useEffect(() => {
    if (!token) { setConversations([]); setActive(null); return; }
    loadConversations();
    const socket = io('/', { path:'/socket.io', auth:{token} });
    socketRef.current = socket;
    socket.on('message:new', msg => {
      setMessages(old => {
        if (active?.id !== msg.conversation_id || old.some(m=>m.id===msg.id)) return old;
        return [...old,msg];
      });
      setConversations(old => old.map(c => c.id===msg.conversation_id ? {...c,lastMessage:msg}:c));
    });
    return () => { socket.disconnect(); socketRef.current=null; };
  },[token]);
  useEffect(() => { if (active && token) loadMessages(active.id); },[active?.id,token]);
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}); },[messages]);
  async function request(path, options={}) {
    const res = await fetch(API+path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }
  async function loadConversations() {
    try { const rows=await request('/conversations'); setConversations(rows); if(!active&&rows.length)setActive(rows[0]); }
    catch(e) { if(e.message.includes('sign in')) logout(); }
  }
  async function loadMessages(id) {
    try {
      const rows=await request(`/conversations/${id}/messages`);
      setMessages(rows); socketRef.current?.emit('conversation:join',id);
    } catch(e) { setError(e.message); }
  }
  function logout() { localStorage.removeItem('ps-session');setSession(null);setConversations([]);setActive(null);setMessages([]);setPage('messages'); }
  async function authenticate(mode, values) {
    setBusy(true);setError('');
    try {
      const data=await request(`/auth/${mode}`,{method:'POST',body:JSON.stringify(values)});
      localStorage.setItem('ps-session',JSON.stringify(data));setSession(data);setModal('');setPage('messages');
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function findUsers(value) {
    setSearch(value);
    if(value.trim().length<2){setMatches([]);return;}
    try {setMatches(await request(`/users/search?q=${encodeURIComponent(value)}`));}catch{}
  }
  async function startChat(username) {
    try {const c=await request('/conversations/direct',{method:'POST',body:JSON.stringify({username})});await loadConversations();setActive(c);setPage('messages');setSearch('');setMatches([]);setModal('');}
    catch(e){setError(e.message);}
  }
  async function sendMessage(e) {
    e.preventDefault();const body=text.trim();if(!body||!active)return;
    setText('');
    try {
      const msg=await request(`/conversations/${active.id}/messages`,{method:'POST',body:JSON.stringify({body})});
      setMessages(old=>old.some(m=>m.id===msg.id)?old:[...old,msg]);
      setConversations(old=>old.map(c=>c.id===active.id?{...c,lastMessage:msg}:c));
    } catch(e) {setError(e.message);setText(body);}
  }
  const title = active?.title || 'Your inbox';
  const initials = name => (name||'?').slice(0,1).toUpperCase();
  const themeLabel = theme==='auto'?'AUTO':theme==='dark'?'COSMIC':'LIGHT';

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={()=>setPage('messages')}><span className="brand-mark">✳</span><span>PIXELSTAR</span></button>
      <div className="top-center"><span className="micro">COMMUNICATION PLATFORM</span><span className="top-dot">/</span><span className="micro">EST. 2026</span></div>
      <div className="top-actions">
        <button className="theme-switch" onClick={()=>setTheme(theme==='auto'?'dark':theme==='dark'?'light':'auto')} title="Cycle theme"><span className="theme-icon">{theme==='light'?<Sun size={14}/>:theme==='dark'?<Moon size={14}/>:<Sparkles size={14}/>}</span><span>{themeLabel}</span></button>
        {user ? <button className="profile-chip" onClick={()=>setPage('profile')}><span className="avatar-mini">{initials(user.username)}</span><span>{user.username}</span><ChevronDown size={13}/></button> : <button className="sign-in" onClick={()=>setModal('login')}>SIGN IN <ArrowUpRight size={13}/></button>}
      </div>
    </header>

    <div className="workspace">
      <aside className={`sidebar ${mobileNav?'show':''}`}>
        <div className="side-label">WORKSPACE <span>01</span></div>
        <button className={`side-link ${page==='messages'?'selected':''}`} onClick={()=>{setPage('messages');setMobileNav(false)}}><MessageCircle/><span>Messages</span><kbd>⌘ 1</kbd></button>
        <button className={`side-link ${page==='contacts'?'selected':''}`} onClick={()=>{setPage('contacts');setMobileNav(false)}}><Users/><span>Contacts</span></button>
        <button className={`side-link ${page==='communities'?'selected':''}`} onClick={()=>{setPage('communities');setMobileNav(false)}}><Compass/><span>Communities</span><span className="soon">SOON</span></button>
        <div className="side-label recent-label">RECENT <span>02</span></div>
        <div className="conversation-list">
          {conversations.map(c=><button key={c.id} className={`conversation ${active?.id===c.id?'current':''}`} onClick={()=>{setActive(c);setPage('messages');setMobileNav(false)}}><span className="avatar">{initials(c.title)}</span><span className="conversation-meta"><b>{c.title}</b><small>{c.lastMessage?.body||'Start a conversation'}</small></span><span className="conversation-arrow">↗</span></button>)}
          {!conversations.length&&<div className="empty-side">Your conversations<br/>will appear here.</div>}
        </div>
        <div className="side-bottom">
          <button className={`side-link ${page==='settings'?'selected':''}`} onClick={()=>setPage('settings')}><Settings/><span>Settings</span></button>
          {user&&<div className="signed-user"><span className="avatar avatar-accent">{initials(user.username)}</span><div><b>{user.username}</b><small><i className="online-dot"/> ONLINE</small></div><button className="icon-button" onClick={logout} title="Sign out"><LogOut size={15}/></button></div>}
        </div>
      </aside>
      <main className="main-area">
        <div className="mobile-head"><button className="icon-button" onClick={()=>setMobileNav(!mobileNav)}><Menu/></button><span className="micro">PIXELSTAR / WORKSPACE</span></div>
        {page==='messages'&&<><div className="page-heading"><div><div className="eyebrow">01 / YOUR WORKSPACE</div><h1>Messages<span> / Inbox</span></h1></div><button className="primary-button" onClick={()=>{setModal('new');setError('')}}><Plus size={15}/> NEW CONVERSATION</button></div>
          <div className="chat-layout">
            <section className="chat-panel">
              {active?<><div className="chat-heading"><span className="avatar avatar-large">{initials(title)}</span><div><b>{title}</b><small><i className="online-dot"/> DIRECT CONVERSATION</small></div><div className="chat-heading-end"><span className="micro">ID / {String(active.id).padStart(3,'0')}</span><button className="icon-button"><MoreHorizontal/></button></div></div>
                <div className="message-stream"><div className="date-divider"><span>CONVERSATION HISTORY</span></div>
                  {messages.map(m=><article key={m.id} className={`message ${m.sender_id===user?.id?'mine':''}`}><span className="avatar message-avatar">{initials(m.sender)}</span><div className="message-content"><div className="message-meta"><b>{m.sender_id===user?.id?'YOU':m.sender}</b><time>{new Date(m.created_at+'Z').toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time></div><div className="message-bubble">{m.body}</div></div></article>)}
                  {!messages.length&&<div className="empty-chat"><span>✳</span><b>A new conversation begins.</b><small>Send the first message to get things moving.</small></div>}
                  <div ref={bottomRef}/></div>
                <form className="composer" onSubmit={sendMessage}><span className="composer-plus">＋</span><input value={text} onChange={e=>setText(e.target.value)} placeholder="Write something worth saying..." maxLength={2000}/><span className="composer-hint">ENTER ↵</span><button className="send-button" type="submit" disabled={!text.trim()}><ArrowUpRight size={18}/></button></form>
              </>:<div className="no-chat"><div className="eyebrow">WELCOME / 001</div><h2>Your space.<br/><em>Your people.</em></h2><p>Start a conversation and make this space yours.</p><button className="primary-button" onClick={()=>setModal('new')}><Plus size={15}/> NEW CONVERSATION</button></div>}
            </section>
            <aside className="info-panel"><div className="eyebrow">CONVERSATION / INFO</div>{active?<><span className="avatar info-avatar">{initials(title)}</span><h3>{title}</h3><p className="muted">PixelStar member</p><div className="info-row"><small>TYPE</small><b>Direct message</b></div><div className="info-row"><small>MEMBERS</small><b>{active.members?.length||2} people</b></div><div className="info-row"><small>MESSAGES</small><b>{messages.length} total</b></div><div className="info-note">A quieter corner of the internet, made for real conversations.</div></>:<p className="muted">Select a conversation to see its details.</p>}</aside>
          </div></>}
        {page==='contacts'&&<div className="generic-page"><div className="eyebrow">02 / YOUR NETWORK</div><h1>Contacts<span> / People</span></h1><p className="intro">Find your people. Start a conversation.</p><div className="search-box"><Search size={17}/><input value={search} onChange={e=>findUsers(e.target.value)} placeholder="Search by username..."/></div>{matches.map(m=><button className="contact-row" key={m.id} onClick={()=>startChat(m.username)}><span className="avatar">{initials(m.username)}</span><b>{m.username}</b><span className="row-action">MESSAGE ↗</span></button>)}</div>}
        {page==='communities'&&<div className="generic-page"><div className="eyebrow">03 / FIND YOUR CIRCLE</div><h1>Communities<span> / Soon</span></h1><p className="intro">Shared spaces, shared interests. Communities are planned for a future PixelStar release.</p><div className="feature-card"><Sparkles/><h2>Something bigger is coming.</h2><p>Public spaces, channels, roles and community discovery.</p></div></div>}
        {page==='profile'&&<div className="generic-page"><div className="eyebrow">04 / YOUR IDENTITY</div><h1>Profile<span> / Account</span></h1>{user?<div className="profile-card"><span className="avatar profile-avatar">{initials(user.username)}</span><h2>{user.username}</h2><p>PixelStar member</p><div className="info-row"><small>ACCOUNT ID</small><b>PS-{user.id}</b></div><button className="outline-button" onClick={logout}><LogOut size={14}/> SIGN OUT</button></div>:<><p className="intro">Sign in to view your profile.</p><button className="primary-button" onClick={()=>setModal('login')}>SIGN IN <ArrowUpRight size={14}/></button></>}</div>}
        {page==='settings'&&<div className="generic-page"><div className="eyebrow">05 / PREFERENCES</div><h1>Settings<span> / Experience</span></h1><p className="intro">Make PixelStar feel like your space.</p><div className="setting-row"><div><b>Appearance</b><small>Choose how PixelStar looks.</small></div><select value={theme} onChange={e=>setTheme(e.target.value)}><option value="auto">Auto / System</option><option value="dark">Cosmic Dark</option><option value="light">Light</option></select></div><div className="setting-row"><div><b>Motion</b><small>Animations respect your device preferences.</small></div><span className="micro">SYSTEM CONTROL</span></div><div className="setting-row"><div><b>Security</b><small>Passwords are hashed on the server.</small></div><Shield size={17}/></div></div>}
      </main>
    </div>
    <footer className="footer"><span>PIXELSTAR® — YOUR UNIVERSE TO CONNECT.</span><span>V1.0 / BUILT FOR PEOPLE</span></footer>
  </div>
  {modal&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setModal('')}><div className="modal-card"><button className="modal-close" onClick={()=>{setModal('');setError('')}}><X size={17}/></button><div className="eyebrow">PIXELSTAR / {modal==='new'?'NEW CONVERSATION':'ACCOUNT ACCESS'}</div><h2>{modal==='new'?'Find your person.':modal==='register'?'Create your account.':'Welcome back.'}</h2><p className="modal-copy">{modal==='new'?'Search for a registered PixelStar username.':'Your universe is one sign-in away.'}</p>
    {modal==='new'?<><label>USERNAME</label><div className="search-box modal-search"><AtSign size={16}/><input autoFocus value={search} onChange={e=>findUsers(e.target.value)} placeholder="Search username"/></div>{matches.map(m=><button className="contact-row" key={m.id} onClick={()=>startChat(m.username)}><span className="avatar">{initials(m.username)}</span><b>{m.username}</b><span className="row-action">START ↗</span></button>)}</>:<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);authenticate(modal,{...(modal==='register'?{username:f.get('username')}:{}),...(modal==='register'?{email:f.get('email')}:{login:f.get('login')}),password:f.get('password')})}}>
      {modal==='register'&&<><label>USERNAME</label><input name="username" required minLength="3" maxLength="20" pattern="[A-Za-z0-9_]+" placeholder="starplayer"/></>}
      <label>{modal==='register'?'EMAIL':'USERNAME OR EMAIL'}</label><input name={modal==='register'?'email':'login'} type={modal==='register'?'email':'text'} required placeholder={modal==='register'?'you@example.com':'Your login'}/>
      <label>PASSWORD</label><input name="password" type="password" required minLength="8" placeholder="At least 8 characters"/>
      <button className="primary-button modal-submit" disabled={busy}>{busy?'PLEASE WAIT...':modal==='register'?'CREATE ACCOUNT ↗':'SIGN IN ↗'}</button>
    </form>}
    {error&&<p className="error-text">{error}</p>}
    {modal!=='new'&&<button className="switch-auth" onClick={()=>{setError('');setModal(modal==='register'?'login':'register')}}>{modal==='register'?'Already have an account? Sign in':'New to PixelStar? Create an account'}</button>}
    <div className="modal-foot">BY CONTINUING, YOU AGREE TO USE PIXELSTAR RESPONSIBLY.</div>
  </div></div>}
</div>;
}
createRoot(document.getElementById('root')).render(<App/>);
