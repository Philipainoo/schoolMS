"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type Listing = {
  id: string; seller_id: string; title: string; description: string; category: string;
  price: number; item_condition: string; location: string; status: "active" | "sold";
  created_at: string;
};
type Seller = { user_id: string; display_name: string; username: string };

const categories = ["All categories","Books","Electronics","Fashion","Furniture","Accommodation","Other"];
const money = (amount: number) => new Intl.NumberFormat("en-GH",{style:"currency",currency:"GHS",maximumFractionDigits:2}).format(amount);

export default function MarketplacePage() {
  const supabase = useMemo(() => { try { return getSupabase(); } catch { return null; } }, []);
  const [user,setUser] = useState<User|null>(null);
  const [verified,setVerified] = useState(false);
  const [listings,setListings] = useState<Listing[]>([]);
  const [sellers,setSellers] = useState<Record<string,Seller>>({});
  const [search,setSearch] = useState("");
  const [category,setCategory] = useState("All categories");
  const [showForm,setShowForm] = useState(false);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [form,setForm] = useState({title:"",description:"",category:"Books",price:"",item_condition:"Good",location:"UEW Campus"});

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({data}) => setUser(data.session?.user ?? null));
    const {data:listener}=supabase.auth.onAuthStateChange((_event,session)=>setUser(session?.user ?? null));
    return ()=>listener.subscription.unsubscribe();
  },[supabase]);

  async function loadListings() {
    if (!supabase || !user) return;
    const {data:account,error:accountError}=await supabase.from("users").select("verification_status,institution_id").eq("id",user.id).single();
    if (accountError || account?.verification_status !== "verified") { setVerified(false); setNotice("A verified UEW account is required to use the Marketplace."); return; }
    setVerified(true);
    const {data,error}=await supabase.from("marketplace_listings")
      .select("id,seller_id,title,description,category,price,item_condition,location,status,created_at")
      .eq("institution_id",account.institution_id).neq("status","removed")
      .order("created_at",{ascending:false}).limit(100);
    if (error) { setNotice(error.message); return; }
    const rows=(data ?? []) as Listing[];
    setListings(rows);
    const ids=[...new Set(rows.map(row=>row.seller_id))];
    if (ids.length) {
      const {data:people}=await supabase.from("profiles").select("user_id,display_name,username").in("user_id",ids);
      setSellers(Object.fromEntries(((people ?? []) as Seller[]).map(person=>[person.user_id,person])));
    }
  }

  useEffect(()=>{ if(user) void loadListings(); },[user]);

  async function createListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user) return;
    setBusy(true); setNotice("");
    try {
      const {data:account,error:accountError}=await supabase.from("users").select("verification_status,institution_id").eq("id",user.id).single();
      if (accountError || account?.verification_status !== "verified") throw new Error("Only verified UEW members can publish listings.");
      const {error}=await supabase.from("marketplace_listings").insert({
        institution_id:account.institution_id,seller_id:user.id,title:form.title.trim(),description:form.description.trim(),
        category:form.category,price:Number(form.price),item_condition:form.item_condition,location:form.location.trim()
      });
      if (error) throw error;
      setForm({title:"",description:"",category:"Books",price:"",item_condition:"Good",location:"UEW Campus"});
      setShowForm(false); setNotice("Your listing is now live."); await loadListings();
    } catch(error) { setNotice(error instanceof Error ? error.message : "Could not publish your listing."); }
    finally { setBusy(false); }
  }

  async function contactSeller(sellerId:string) {
    if (!supabase) return;
    setBusy(true); setNotice("");
    try {
      const {error}=await supabase.rpc("open_direct_conversation",{target_user_id:sellerId});
      if (error) throw error;
      setNotice("Private chat created. Open Messages on CampusConnect to contact the seller.");
    } catch(error) { setNotice(error instanceof Error ? error.message : "Could not start a chat."); }
    finally { setBusy(false); }
  }

  async function updateStatus(id:string,status:"sold") {
    if (!supabase) return;
    const {error}=await supabase.from("marketplace_listings").update({status,updated_at:new Date().toISOString()}).eq("id",id).eq("seller_id",user?.id);
    if (error) setNotice(error.message); else { setNotice("Listing marked as sold."); await loadListings(); }
  }

  const visible=listings.filter(item=>(category==="All categories" || item.category===category)
    && (item.title+" "+item.description+" "+item.location).toLowerCase().includes(search.toLowerCase()));
  if (!user) return <main className="market-shell"><header className="market-header"><Link href="/">CampusConnect</Link></header><section className="market-empty"><h1>UEW Marketplace</h1><p>Sign in to your verified UEW account to browse campus listings.</p><Link href="/">Go to sign in</Link></section></main>;

  return <main className="market-shell">
    <header className="market-header"><Link className="market-brand" href="/">CampusConnect <span>UEW</span></Link><nav><Link href="/">Home feed</Link><Link href="/#messages">Messages</Link></nav></header>
    <section className="market-hero"><div><span className="market-eyebrow">BUY · SELL · CONNECT</span><h1>UEW Marketplace</h1><p>Find useful things from people in your campus community.</p></div><button className="market-primary" onClick={()=>setShowForm(value=>!value)}>＋ Sell an item</button></section>
    {notice && <p className="market-notice" role="status">{notice}</p>}
    {!verified ? <section className="market-empty"><h2>Campus verification required</h2><p>Marketplace access is limited to verified UEW members.</p></section> : <>
      {showForm && <form className="market-form" onSubmit={createListing}>
        <div className="market-form-heading"><h2>Create a listing</h2><button type="button" onClick={()=>setShowForm(false)}>Close</button></div>
        <label>Item title<input required minLength={3} maxLength={100} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Engineering mathematics textbook"/></label>
        <label>Description<textarea required minLength={10} maxLength={2000} rows={4} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Describe the item and any details a buyer should know."/></label>
        <div className="market-form-grid"><label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.slice(1).map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Price (GHS)<input required type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} placeholder="0.00"/></label>
          <label>Condition<select value={form.item_condition} onChange={e=>setForm({...form,item_condition:e.target.value})}>{["New","Like new","Good","Fair"].map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Pickup location<input required maxLength={100} value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label></div>
        <button className="market-primary" disabled={busy}>{busy?"Publishing…":"Publish listing"}</button>
      </form>}
      <section className="market-tools"><input aria-label="Search listings" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search books, electronics, furniture…"/><select aria-label="Filter category" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(value=><option key={value}>{value}</option>)}</select></section>
      <div className="market-results-heading"><h2>Campus listings</h2><span>{visible.length} items</span></div>
      {visible.length ? <section className="market-grid">{visible.map(item=><article className="market-card" key={item.id}>
        <div className="market-card-top"><span>{item.category}</span><span className={item.status==="sold"?"market-sold":"market-available"}>{item.status==="sold"?"SOLD":"AVAILABLE"}</span></div>
        <h3>{item.title}</h3><strong className="market-price">{money(Number(item.price))}</strong><p>{item.description}</p>
        <div className="market-item-meta"><span>◷ {item.item_condition}</span><span>⌖ {item.location}</span></div>
        <div className="market-seller"><span className="market-avatar">{(sellers[item.seller_id]?.display_name || "U").slice(0,1).toUpperCase()}</span><div><strong>{sellers[item.seller_id]?.display_name || "UEW member"}</strong><small>@{sellers[item.seller_id]?.username || "member"}</small></div></div>
        {item.seller_id===user.id ? <button className="market-outline" disabled={item.status==="sold"} onClick={()=>void updateStatus(item.id,"sold")}>{item.status==="sold"?"Marked sold":"Mark as sold"}</button>
          : <button className="market-outline" disabled={item.status==="sold" || busy} onClick={()=>void contactSeller(item.seller_id)}>{item.status==="sold"?"Item sold":"Message seller"}</button>}
      </article>)}</section> : <section className="market-empty"><h3>No listings found</h3><p>Try another search or category, or be the first to list an item.</p></section>}
    </>}
    <footer className="market-footer">CampusConnect · University of Education, Winneba</footer>
  </main>;
}
