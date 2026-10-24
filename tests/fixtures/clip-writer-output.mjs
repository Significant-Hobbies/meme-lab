export function clipWriterOutput(captions) {
  return {decision:'captions',reaction:'An approving gesture.',tension:'A success without the expected effort.',drafts:[...captions,'A fourth draft.','A fifth draft.','A sixth draft.'].map((text,index)=>({text,angle:'Angle '+index})),selected:[0,1,2]};
}
