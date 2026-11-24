
import {hostedRetrievalCatalogue} from './catalogue.mjs';
import {needsSeriousHandling,requiresFactualAnswer} from './classification.mjs';

export const CATALOGUE_SUGGESTIONS='catalogue_suggestions';

const approvedClips=new Map(hostedRetrievalCatalogue.map(record=>[record.id,record]));
// Each motif points only at approved clips whose catalogued use case describes
// the same reaction. Require all cues; a single keyword never suggests a clip.
const motifs=[
  {
    cues:[/\b(?:fridge|refrigerator)\b/i,/\b(?:open(?:ed|ing)?|check(?:ed|ing)?|look(?:ed|ing)?)\b/i,/\b(?:again|twice|(?:three|four|five|\d+) times)\b/i,/\b(?:hop(?:e|ed|ing)|expect(?:ed|ing)?)\b/i,/\b(?:snacks?|food|leftovers?)\b/i],
    excludes:/\b(?:found|discovered) (?:a|an|some|the|\w+\s+\w+)\b/i,
    clips:['clip-caminandes-3-deflated']
  },
  {
    cues:[/\b(?:my|our)\s+(?:sibling|brother|sister|friend|coworker|partner|roommate|teammate)\s+(?:just\s+)?(?:ate|finished|took|grabbed|stole)\s+(?:(?:(?:the|my|our)\s+)?last\s+(?:\w+\s+)?(?:slice|piece|cookie|brownie|snack|bite|pastry|donut|doughnut)|my leftovers|the leftovers with my name)\b/i],
    clips:['clip-caminandes-3-already-gone','clip-caminandes-3-deflated']
  },
  {
    cues:[/\b(?:coworker|colleague|teammate|manager|boss)\b/i,/\b(?:deadline|due)\b/i,/\b(?:start(?:ed)?|took|takes?|another)\s+(?:(?:a|another|the)\s+)?coffee break\b/i],
    excludes:/\b(?:finished|completed|submitted|delivered)\b/i,
    clips:['clip-bbb-waiting','clip-bbb-not-impressed']
  },
  {
    cues:[/\b(?:wait(?:ed|ing)?|stuck)\b/i,/\b(?:approval|download|upload)\b/i,/\b(?:hours?|minutes?|still|again)\b/i],
    clips:['clip-bbb-waiting']
  },
  {
    cues:[/\b(?:tests?|test suite|build|pipeline)\b/i,/\b(?:passed|green|succeeded|worked)\b/i,/\b(?:finally|at last|after \w+ tries)\b/i],
    excludes:/\b(?:failed|failing|broken|broke)\s+(?:again|afterwards|later)\b/i,
    clips:['clip-spring-made-it']
  },
  {
    cues:[/\b(?:home|sofa|couch)\b/i,/\b(?:long day|long shift|all day)\b/i,/\b(?:wiped|exhausted|tired|collapsed)\b/i],
    clips:['clip-coffee-run-finally-home']
  },
  {
    cues:[/\b(?:interrupted|doorbell rang|knocked)\b/i,/\b(?:sit down|sat down|took a break|rest|quiet|peace)\b/i,/\b(?:finally|just|again|every time)\b/i],
    clips:['clip-bbb-peace']
  },
  {
    cues:[/\bmeeting\b/i,/\b(?:could|should) have been an? (?:e-?mail|message)\b/i,/\b(?:scheduled|booked)\s+(?:another|a follow[- ]up)\b/i],
    clips:['clip-bbb-not-impressed','clip-tears-of-steel-wait-what']
  },
  {
    cues:[/\b(?:borrowed|took)\b/i,/\b(?:charger|charging cable)\b/i,/\b(?:returned|brought it back)\b/i,/\b(?:days?|weeks?) later\b/i],
    clips:['clip-bbb-not-impressed']
  }
];

// Avoid interpreting negation, quoted speech, conditionals, conflicting
// emotional cues or mentions of harm without the normal contextual ranking.
const ambiguous=/["“”]|\b(?:not|never|without|no|nobody|neither|nor|if|unless|pretend(?:ed|ing)?|sarcasm|sarcastic|injur\w*|died|cancer|hospice|dementia|surgery|surgical|stroke|heart attack|bleed\w*|hospital|fired|laid off|grief|emergency|emergencies|evict\w*|abuse\w*|apolog\w*|sincere|in a bad way|panic|violence)\b|\b\w+n['’]t\b/i;

export function suggestCatalogueClips(comment) {
  if(ambiguous.test(comment)||requiresFactualAnswer(comment)||needsSeriousHandling(comment))return [];
  const segments=comment.split(/[.!?\n]+/);
  const matches=motifs.filter(({cues,excludes})=>!excludes?.test(comment)&&segments.some(segment=>cues.every(cue=>cue.test(segment))));
  // Unclear overlaps fall back to the gallery. No actors, inferred
  // perspectives, semantic confidence or fabricated candidates.
  if(matches.length!==1)return [];
  return matches[0].clips.map(id=>approvedClips.get(id)).filter(Boolean);
}
