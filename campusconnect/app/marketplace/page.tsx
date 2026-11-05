"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type Listing = {
  id: string; seller_id: string; title: string; description: string; category: string;
  price: number; item_condition: string; location: string; status: "active" | "sold";
  created_at: string; image_path: string | null;
};
type Seller = { user_id: string; display_name: string; username: string };
type PurchaseRequest = { id:string; listing_id:string; buyer_id:string; seller_id:string; status:"pending"|"confirmed"|"declined" };
type Review = { id:string; listing_id:string; seller_id:string; buyer_id:string; rating:number; review_text:string };

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
  const [imageFile,setImageFile] = useState<File|null>(null);
  const [imageUrls,setImageUrls] = useState<Record<string,string>>({});
  const [savedIds,setSavedIds] = useState<string[]>([]);
  const [savedOnly,setSavedOnly] = useState(false);
  const [purchaseRequests,setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [reviews,setReviews] = useState<Review[]>([]);
  const [reviewDraft,setReviewDraft] = useState<{requestId:string;listingId:string;sellerId:string;rating:number;text:string}|null>(null);
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
      .select("id,seller_id,title,description,category,price,item_condition,location,status,created_at,image_path")
      .eq("institution_id",account.institution_id).neq("status","removed")
      .order("created_at",{ascending:false}).limit(100);
    if (error) { setNotice(error.message); return; }
    const rows=(data ?? []) as Listing[];
    setListings(rows);
    const {data:savedRows}=await supabase.from("marketplace_listing_saves").select("listing_id").eq("user_id",user.id);
    setSavedIds((savedRows ?? []).map((row:{listing_id:string})=>row.listing_id));
    const signedImages=await Promise.all(rows.filter(row=>row.image_path).map(async row=>{ const {data:result}=await supabase.storage.from("marketplace-images").createSignedUrl(row.image_path as string,3600); return result?.signedUrl ? [row.id,result.signedUrl] as const : null; }));
    setImageUrls(Object.fromEntries(signedImages.filter((item)=>item!==null) as Array<readonly [string,string]>));
    const [{data:requestRows},{data:reviewRows}]=await Promise.all([
      supabase.from("marketplace_purchase_requests").select("id,listing_id,buyer_id,seller_id,status").or("buyer_id.eq."+user.id+",seller_id.eq."+user.id),
      supabase.from("marketplace_reviews").select("id,listing_id,seller_id,buyer_id,rating,review_text").in("listing_id",rows.length?rows.map(row=>row.id):["00000000-0000-0000-0000-000000000000"])
    ]);
    const requests=(requestRows ?? []) as PurchaseRequest[];
    setPurchaseRequests(requests);
    setReviews((reviewRows ?? []) as Review[]);
    const ids=[...new Set([...rows.map(row=>row.seller_id),...requests.map(row=>row.buyer_id)])];
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
      const {data:listing,error}=await supabase.from("marketplace_listings").insert({
        institution_id:account.institution_id,seller_id:user.id,title:form.title.trim(),description:form.description.trim(),
        category:form.category,price:Number(form.price),item_condition:form.item_condition,location:form.location.trim()
      }).select("id").single();
      if (error) throw error;
      if (imageFile && listing) {
        const extension=imageFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const imagePath=user.id+"/"+listing.id+"."+extension;
        const {error:uploadError}=await supabase.storage.from("marketplace-images").upload(imagePath,imageFile,{contentType:imageFile.type,upsert:true});
        if (uploadError) { await supabase.from("marketplace_listings").delete().eq("id",listing.id).eq("seller_id",user.id); throw uploadError; }
        const {error:updateError}=await supabase.from("marketplace_listings").update({image_path:imagePath}).eq("id",listing.id).eq("seller_id",user.id);
        if (updateError) throw updateError;
      }
      setImageFile(null);
      setForm({title:"",description:"",category:"Books",price:"",item_condition:"Good",location:"UEW Campus"});
      setShowForm(false); setNotice("Your listing is now live."); await loadListings();
    } catch(error) { setNotice(error instanceof Error ? error.message : "Could not publish your listing."); }
    finally { setBusy(false); }
  }

  async function toggleSaved(listingId:string) {
    if (!supabase || !user) return;
    const isSaved=savedIds.includes(listingId);
    const {error}=isSaved ? await supabase.from("marketplace_listing_saves").delete().eq("user_id",user.id).eq("listing_id",listingId) : await supabase.from("marketplace_listing_saves").insert({user_id:user.id,listing_id:listingId});
    if (error) { setNotice(error.message); return; }
    setSavedIds(current=>isSaved?current.filter(id=>id!==listingId):[...current,listingId]);
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

  async function requestPurchase(listing:Listing) {
    if (!supabase || !user) return;
    setBusy(true); setNotice("");
    const {error}=await supabase.from("marketplace_purchase_requests").insert({listing_id:listing.id,buyer_id:user.id,seller_id:listing.seller_id});
    if (error) setNotice(error.code==="23505"?"You have already sent a request for this item.":error.message);
    else { setNotice("Purchase request sent. The seller must confirm the transaction before you can leave a review."); await loadListings(); }
    setBusy(false);
  }

  async function confirmPurchase(requestId:string) {
    if (!supabase) return;
    setBusy(true); setNotice("");
    const {error}=await supabase.rpc("confirm_marketplace_purchase",{request_id:requestId});
    if (error) setNotice(error.message);
    else { setNotice("Purchase confirmed. The buyer can now leave a seller review."); await loadListings(); }
    setBusy(false);
  }

  async function submitReview(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !reviewDraft) return;
    setBusy(true); setNotice("");
    const {error}=await supabase.from("marketplace_reviews").insert({
      purchase_request_id:reviewDraft.requestId,listing_id:reviewDraft.listingId,
      buyer_id:user.id,seller_id:reviewDraft.sellerId,rating:reviewDraft.rating,
      review_text:reviewDraft.text.trim()
    });
    if (error) setNotice(error.code==="23505"?"You have already reviewed this purchase.":error.message);
    else { setNotice("Thank you. Your seller review has been published."); setReviewDraft(null); await loadListings(); }
    setBusy(false);
  }

  const visible=listings.filter(item=>(!savedOnly || savedIds.includes(item.id)) && (category==="All categories" || item.category===category)
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
        <label>Item photo (optional, JPG/PNG/WebP, max 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0] ?? null;if(file && (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size>5*1024*1024)){setNotice("Choose a JPG, PNG or WebP image under 5 MB.");event.target.value="";setImageFile(null);return;}setImageFile(file);}}/><small>{imageFile ? imageFile.name : "Add one clear photo of the item."}</small></label>
        <label>Description<textarea required minLength={10} maxLength={2000} rows={4} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Describe the item and any details a buyer should know."/></label>
        <div className="market-form-grid"><label>Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.slice(1).map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Price (GHS)<input required type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} placeholder="0.00"/></label>
          <label>Condition<select value={form.item_condition} onChange={e=>setForm({...form,item_condition:e.target.value})}>{["New","Like new","Good","Fair"].map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Pickup location<input required maxLength={100} value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label></div>
        <button className="market-primary" disabled={busy}>{busy?"Publishing…":"Publish listing"}</button>
      </form>}
      {reviewDraft && <form className="market-form" onSubmit={submitReview}>
        <div className="market-form-heading"><h2>Review your purchase</h2><button type="button" onClick={()=>setReviewDraft(null)}>Close</button></div>
        <label>Seller rating<select value={reviewDraft.rating} onChange={event=>setReviewDraft({...reviewDraft,rating:Number(event.target.value)})}>{[5,4,3,2,1].map(value=><option key={value} value={value}>{value} out of 5 stars</option>)}</select></label>
        <label>Your experience (optional)<textarea rows={3} maxLength={1000} value={reviewDraft.text} onChange={event=>setReviewDraft({...reviewDraft,text:event.target.value})} placeholder="Share helpful details about the transaction."/></label>
        <button className="market-primary" disabled={busy}>{busy?"Submitting…":"Publish review"}</button>
      </form>}
      <section className="market-tools"><input aria-label="Search listings" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search books, electronics, furniture…"/><select aria-label="Filter category" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(value=><option key={value}>{value}</option>)}</select><button type="button" className={savedOnly?"market-filter-active":"market-filter-button"} onClick={()=>setSavedOnly(value=>!value)}>♥ {savedOnly?"Showing saved":"Saved items"} ({savedIds.length})</button></section>
      <div className="market-results-heading"><h2>Campus listings</h2><span>{visible.length} items</span></div>
      {visible.length ? <section className="market-grid">{visible.map(item=><article className="market-card" key={item.id}>
        <div className="market-card-top"><span>{item.category}</span><span className={item.status==="sold"?"market-sold":"market-available"}>{item.status==="sold"?"SOLD":"AVAILABLE"}</span></div>
        {imageUrls[item.id] && <img className="market-listing-image" src={imageUrls[item.id]} alt={item.title} />}
        <div className="market-title-row"><h3>{item.title}</h3><button type="button" className={savedIds.includes(item.id)?"market-save-button saved":"market-save-button"} aria-label={savedIds.includes(item.id)?"Remove saved listing":"Save listing"} title={savedIds.includes(item.id)?"Remove saved listing":"Save listing"} onClick={()=>void toggleSaved(item.id)}>♥</button></div><strong className="market-price">{money(Number(item.price))}</strong><p>{item.description}</p>
        <div className="market-item-meta"><span>◷ {item.item_condition}</span><span>⌖ {item.location}</span></div>
        <div className="market-seller"><span className="market-avatar">{(sellers[item.seller_id]?.display_name || "U").slice(0,1).toUpperCase()}</span><div><strong>{sellers[item.seller_id]?.display_name || "UEW member"}</strong><small>@{sellers[item.seller_id]?.username || "member"}</small></div></div>
        <div className="market-rating-summary">
          <strong>{(()=>{const own=reviews.filter(review=>review.seller_id===item.seller_id);return own.length?"★ "+(own.reduce((sum,review)=>sum+review.rating,0)/own.length).toFixed(1)+" · "+own.length+" review"+(own.length===1?"":"s"):"No seller reviews yet";})()}</strong>
          {reviews.filter(review=>review.listing_id===item.id).slice(0,2).map(review=><p key={review.id}>{"★".repeat(review.rating)}{"☆".repeat(5-review.rating)} <span>{review.review_text || "Buyer left a rating."}</span></p>)}
        </div>
        {item.seller_id===user.id ? <>
          {purchaseRequests.filter(request=>request.listing_id===item.id && request.status==="pending").map(request=><div className="market-request-row" key={request.id}><span>Purchase request from {sellers[request.buyer_id]?.display_name || "UEW buyer"}</span><button className="market-outline" disabled={busy || item.status==="sold"} onClick={()=>void confirmPurchase(request.id)}>Confirm sale</button></div>)}
          <button className="market-outline" disabled={item.status==="sold"} onClick={()=>setNotice("To collect a verified buyer review, ask the buyer to send a purchase request and confirm it here. This keeps reviews tied to completed campus transactions.")}>{item.status==="sold"?"Marked sold":"How to confirm a sale"}</button>
        </> : <>
          <button className="market-outline" disabled={item.status==="sold" || busy || purchaseRequests.some(request=>request.listing_id===item.id && request.buyer_id===user.id)} onClick={()=>void requestPurchase(item)}>{purchaseRequests.some(request=>request.listing_id===item.id && request.buyer_id===user.id)?"Request sent":item.status==="sold"?"Item sold":"I want to buy this"}</button>
          <button className="market-outline" disabled={busy} onClick={()=>void contactSeller(item.seller_id)}>Message seller</button>
          {purchaseRequests.filter(request=>request.listing_id===item.id && request.buyer_id===user.id && request.status==="confirmed" && !reviews.some(review=>review.buyer_id===user.id && review.listing_id===item.id)).map(request=><button key={request.id} className="market-outline" onClick={()=>setReviewDraft({requestId:request.id,listingId:item.id,sellerId:item.seller_id,rating:5,text:""})}>Rate this seller</button>)}
        </>}
      </article>)}</section> : <section className="market-empty"><h3>No listings found</h3><p>Try another search or category, or be the first to list an item.</p></section>}
    </>}
    <footer className="market-footer">CampusConnect · University of Education, Winneba</footer>
  </main>;
}
