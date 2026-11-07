// Visible collection defaults and card copy shared by HTML and public Markdown.
export const collectionPageSize=24;
export function collectionDescription(shelves,collection){return shelves.find(shelf=>shelf.id===collection)?.description||(collection==='selected'?'A considered starting point. Explore the full catalog whenever you want.':'Explore the full catalog by feeling, situation, and format.');}
export function collectionAction(meme,editable){return meme.media_type==='gif'?'Caption this clip →':editable?'Make this meme →':'Use original reaction →';}
export function collectionDetail(meme){return meme.quality?.state==='measured'?`${meme.quality.width} × ${meme.quality.height}${meme.provenance?.source_title?' · '+meme.provenance.source_title:' source'}`:'Source size unchecked';}
