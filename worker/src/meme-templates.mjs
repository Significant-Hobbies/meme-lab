// Regions were inspected against these exact source assets, not inferred from
// names. Coordinates are fractions of the un-cropped original image.
const region=(id,label,role,box,style='plain',rotation=0,extra={})=>({id,label,role,box,style,rotation,maxChars:64,...extra});
export const memeTemplates=[
  {id:'drake-preference',name:'Drake Hotline Bling',image_url:'https://i.imgflip.com/30b1gx.jpg',aspect:1,
    grammar:'Reject a sensible or less-preferred option; enthusiastically choose the contrasting option. Do not reverse the preference. Use short option labels, usually 2–5 words. If an option’s target is ambiguous, omit that target rather than guessing it.',regions:[
      region('rejected','Rejected option','The option rejected by the person in the upper panel.',[.53,.04,.43,.42]),
      region('preferred','Preferred option','The option approved by the person in the lower panel.',[.53,.54,.43,.42])]},
  {id:'two-buttons',name:'Two Buttons',image_url:'https://i.imgflip.com/1g8my4.jpg',aspect:600/908,
    grammar:'Two conflicting choices the same person feels compelled to make. Both cannot comfortably be maintained. Keep each choice under six words.',regions:[
      region('choice-a','First choice','One side of the dilemma, above the left red button.',[.09,.105,.29,.075],'plain',-17,{maxChars:32}),
      region('choice-b','Conflicting choice','The conflicting goal, above the right red button.',[.48,.095,.21,.055],'plain',-17,{maxChars:32})]},
  {id:'distracted-boyfriend',name:'Distracted Boyfriend',image_url:'https://i.imgflip.com/1ur9b0.jpg',aspect:1.5,
    grammar:'Label the tempting new alternative, distracted actor, and neglected existing commitment. The woman on the left is the temptation, the man in the middle is the distracted actor, and the woman on the right is the neglected commitment. Preserve who is tempted, not merely the narrator. Use short noun phrases.',regions:[
      region('temptation','New temptation','The new alternative drawing attention, on the left woman’s red torso.',[.05,.65,.36,.22],'outlined',0,{maxChars:48}),
      region('actor','Distracted person','The person or group shifting attention, on the middle man’s torso.',[.47,.56,.25,.21],'outlined',0,{maxChars:32}),
      region('commitment','Existing commitment','The existing commitment being neglected, on the right woman’s torso.',[.74,.65,.23,.21],'outlined',0,{maxChars:48})]},
  {id:'grus-plan',name:'Gru’s Plan',image_url:'https://i.imgflip.com/26jxvz.jpg',aspect:700/449,
    grammar:'Goal, attempted plan, then the actual unwanted CONSEQUENCE caused by that plan. Backfire must not simply repeat the plan: e.g. focus / disable reminders / forget appointment. Final panel repeats the consequence. If the plan succeeded or no failure is stated, return reference.',regions:[
      region('goal','The goal','The intended goal on the upper-left board.',[.285,.11,.185,.34],'plain',0,{maxChars:40}),
      region('plan','The plan','The action intended to achieve the goal on the upper-right board.',[.79,.12,.18,.33],'plain',0,{maxChars:40}),
      region('backfire','The backfire','The unwanted consequence of the plan on the lower-left board.',[.30,.63,.175,.32],'plain',0,{maxChars:40}),
      region('realization','The realization','Repeat the unwanted consequence on the lower-right board.',[.79,.63,.18,.32],'plain',0,{repeatOf:'backfire',maxChars:40})]},
  {id:'expanding-brain',name:'Expanding Brain',image_url:'https://i.imgflip.com/1jwhww.jpg',aspect:857/1202,
    grammar:'Four increasingly elaborate approaches to ONE goal. Each level must escalate the same comic axis; the last is the most overengineered approach, never an ordinary failure such as forgetting. Preserve the stated action: building software must not become downloading or buying it. Only exaggerate approaches when the input already establishes comic escalation; visibly mark an invented approach as hypothetical with a question mark, never an event that happened. A plain factual list with no comic escalation requires reference.',regions:[
      region('ordinary','Ordinary approach','The simplest option in the top-left panel.',[.02,.02,.46,.21]),
      region('clever','Clever approach','A more elaborate option in the second-left panel.',[.02,.27,.46,.21]),
      region('elaborate','Overthinking it','The exaggerated option in the third-left panel.',[.02,.52,.46,.20]),
      region('absurd','Galaxy brain','The most absurd escalation in the bottom-left panel.',[.02,.77,.46,.21])]},
  {id:'change-my-mind',name:'Change My Mind',image_url:'https://i.imgflip.com/24y43o.jpg',aspect:482/361,
    grammar:'One short, debatable claim drawn from the situation. Write only the claim; the existing CHANGE MY MIND text below it supplies the challenge.',regions:[
      region('claim','The claim','A short opinion on the blank upper part of the sign. Do not cover the existing slogan.',[.465,.59,.37,.21],'plain',-6)]},
  {id:'x-everywhere',name:'X, X Everywhere',image_url:'https://i.imgflip.com/1ihzfe.jpg',aspect:1920/1305,
    grammar:'An allegedly unique thing is actually everywhere. Top names the repeated object; bottom repeats that object with an everywhere punchline in the situation’s language. Keep the specific irony and object. Do not label Woody or Buzz or put both captions across a face.',regions:[
      region('topic','The repeated thing','Name the recurring object in the empty strip above both characters.',[.04,.015,.92,.065],'outlined'),
      region('everywhere','The repetition','The same object everywhere, below the characters’ faces and pointing gesture.',[.04,.895,.92,.085],'outlined')]},
  {id:'success-kid',name:'Success Kid',image_url:'https://i.imgflip.com/1bhk.jpg',aspect:1,
    grammar:'A small unexpected victory for the SAME person in both panels. Top is their difficulty or risky action; bottom is their actual win. Keep the lucky detail or causal link that makes this victory specific, rather than a generic win. Never combine the narrator’s failure with somebody else’s success. Preserve quoted speakers; do not invent the winning margin. If the selected person did not win, return reference.',regions:[
      region('setup','The setup','The expectation or difficulty in the clear space above the child.',[.04,.02,.92,.23],'outlined'),
      region('payoff','The win','The unexpectedly favorable outcome below the child.',[.04,.78,.92,.20],'outlined')]}
];

const byAsset=new Map(memeTemplates.map(template=>[template.image_url,template]));
// Authored examples teach compression and factual boundaries. They are
// distinct from evaluation situations and are not measured model outputs.
export const captionExamples={
  'drake-preference':{situation:'Our team rejected fixing one bug and decided to rewrite the whole app instead.',captions:{rejected:'Fix one bug',preferred:'Rewrite the whole app'},avoid:'Do not say the bug was fixed or the rewrite succeeded.'},
  'two-buttons':{situation:'I want the cheaper flight with a layover, but I also want to fly direct.',captions:{'choice-a':'Spend less','choice-b':'Fly direct'},avoid:'Do not explain the dilemma on the tiny buttons.'},
  'distracted-boyfriend':{situation:'My friend lost interest in their piano after seeing a new guitar.',captions:{temptation:'New guitar',actor:'My friend',commitment:'Their piano'},avoid:'The actor is my friend, not me.'},
  'grus-plan':{situation:'To finish a report I drank coffee before bed, then lay awake all night.',captions:{goal:'Finish the report',plan:'Coffee before bed',backfire:'Awake all night'},avoid:'Do not claim the report was finished. The last panel repeats the backfire.'},
  'expanding-brain':{situation:'We went from a note to a spreadsheet to a database just to track houseplants.',captions:{ordinary:'Write a note',clever:'Make a spreadsheet',elaborate:'Build a database',absurd:'Design a plant ERP?'},avoid:'The final escalation is hypothetical, not an event that occurred.'},
  'change-my-mind':{situation:'A ten-minute task now needs three approval forms.',captions:{claim:'Small tasks need fewer forms'},avoid:'Do not add CHANGE MY MIND or claim an exact completion time.'},
  'x-everywhere':{situation:'Everyone at the party claimed their identical sneakers were unique.',captions:{topic:'Unique sneakers',everywhere:'Unique sneakers everywhere'},avoid:'Keep the repeated object and irony; do not introduce another trend.'},
  'success-kid':{situation:'My cousin said, "I almost missed the train, but caught it." I stayed home.',captions:{setup:'Almost missed the train',payoff:'Caught it'},avoid:'Both captions belong to the cousin. Do not invent how they caught it.'}
};
export function templateFor(record) {
  if(record?.media_type==='gif') return null;
  const template=byAsset.get(record?.media_url||record?.image_url);
  return template?structuredClone(template):null;
}

// Inspected exact artwork with its punchline baked in and no clear caption
// space. Reuse the original without sending the image to an inference provider.
export function unchangedReactionFor(record) {
  return record?.media_type!=='gif'&&(record?.media_url||record?.image_url)==='https://i.imgflip.com/wxica.jpg';
}

export function creationMediaUrl(record) {
  if(!record||record.media_type==='gif') return null;
  try {
    const url=new URL(record.media_url||record.image_url);
    if(url.protocol!=='https:'||url.username||url.password||url.port) return null;
    if(url.hostname==='i.imgflip.com'&&/^\/[a-z0-9]+\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return url.href;
    if(url.hostname==='api.memegen.link'&&/^\/images\/[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return url.href;
  } catch { /* Unknown media stays a reference instead of becoming a proxy URL. */ }
  return null;
}
