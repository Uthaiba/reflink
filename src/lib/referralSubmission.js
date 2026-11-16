function alreadySaved(data) {
  const reference=typeof data.referral_number==="string" ? " Saved reference: "+data.referral_number+"." : "";
  const error=new Error("This referral was already saved."+reference+" Open and verify it in the referral list instead of submitting it again.");
  error.code="REFERRAL_ALREADY_SAVED";
  error.referral=data;
  return error;
}

export async function createReferralOnce(client,payload,clientSubmissionId,fromDraft=false) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientSubmissionId))throw new Error("Invalid referral submission identifier.");
  const find=async()=>client.from("referrals").select("id, referral_number")
    .eq("referring_user_id",payload.referring_user_id).eq("offline_client_id",clientSubmissionId).maybeSingle();
  const before=await find();
  if(before.error)throw new Error("Existing submission status could not be checked. No new referral was submitted.");
  if(before.data)throw alreadySaved(before.data);
  let inserted;
  try{
    inserted=await client.from("referrals").insert({...payload,offline_client_id:clientSubmissionId,
      sync_source:fromDraft?"offline":"online"}).select("id").single();
  }catch{inserted={error:{}};}
  if(!inserted.error&&inserted.data?.id)return inserted.data;
  // A lost response or unique-key race may conceal a committed referral.
  try{
    const existing=await find();
    if(!existing.error&&existing.data)throw alreadySaved(existing.data);
  }catch(error){if(error.code==="REFERRAL_ALREADY_SAVED")throw error;}
  throw new Error("Referral submission could not be confirmed. Keep this form open, preserve the draft and verify the referral list before retrying.");
}
