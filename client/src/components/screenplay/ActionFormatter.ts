import { 
  EditorView, 
  ViewPlugin,
  ViewUpdate
} from '@codemirror/view';
import { 
  Transaction
} from '@codemirror/state';

// Comprehensive list of sounds that should be capitalized
const KEY_SOUNDS = [
  // Impact sounds
  'BANG', 'BOOM', 'CRASH', 'THUD', 'SLAM', 'SMASH', 'CRACK', 'SNAP', 'POP',
  'THUMP', 'POUND', 'KNOCK', 'TAP', 'RAP', 'WHACK', 'SLAP', 'PUNCH', 'HIT',
  
  // Vocal sounds
  'SCREAM', 'YELL', 'SHOUT', 'CRY', 'SOB', 'WAIL', 'MOAN', 'GROAN', 'SIGH',
  'GASP', 'WHEEZE', 'COUGH', 'SNEEZE', 'LAUGH', 'GIGGLE', 'CHUCKLE', 'GROWL',
  'SNARL', 'HISS', 'WHISPER', 'MURMUR', 'WHISTLE',
  
  // Mechanical/Electronic
  'RING', 'BUZZ', 'BEEP', 'DING', 'DONG', 'CHIME', 'ALARM', 'SIREN', 'HONK',
  'SCREECH', 'SQUEAL', 'WHIR', 'HUM', 'CLICK', 'CLACK', 'TICK', 'TOCK',
  
  // Nature/Environment
  'THUNDER', 'LIGHTNING', 'WIND', 'RAIN', 'SPLASH', 'DRIP', 'POUR', 'GUSH',
  'RUSTLE', 'CRACKLE', 'SIZZLE', 'FIZZ', 'BUBBLE', 'GURGLE', 'RUMBLE', 'ROAR',
  
  // Weapons/Explosions
  'GUNSHOT', 'GUNFIRE', 'SHOT', 'SHOTS', 'BLAST', 'EXPLOSION', 'EXPLODE',
  'DETONATE', 'RICOCHET', 'WHOOSH', 'WHIZZ', 'ZAP',
  
  // Movement
  'FOOTSTEPS', 'STOMP', 'SHUFFLE', 'PATTER', 'CLATTER', 'RATTLE', 'JINGLE',
  'CREAK', 'SQUEAK', 'GRIND', 'SCRAPE', 'SCRATCH', 'SCREECH', 'BRAKE', 'SKID',
  
  // Animals
  'BARK', 'WOOF', 'MEOW', 'PURR', 'CHIRP', 'TWEET', 'SQUAWK', 'CAW', 'HOWL',
  'HOOT', 'NEIGH', 'MOO', 'BAA', 'OINK', 'CLUCK', 'CROW',
  
  // Other
  'SILENCE', 'MUSIC', 'STATIC', 'FEEDBACK', 'ECHO', 'REVERB'
];

// Pattern to match sounds with variations
const createSoundPattern = () => {
  const soundsRegex = KEY_SOUNDS.join('|');
  return new RegExp(`\\b(${soundsRegex})(S|ED|ING)?\\b`, 'gi');
};

// Pattern to match character first appearances (2-4 consecutive capitalized words)
const CHARACTER_PATTERN = /\b([A-Z][A-Z\s\-\'\.]{2,30})\b/g;

// Pattern for mini-slugs (secondary scene headings)
const MINI_SLUG_PATTERN = /^(LATER|MOMENTS LATER|CONTINUOUS|SAME|BACK TO|MEANWHILE|ELSEWHERE)/i;

// Pattern for important props or objects
const PROP_PATTERN = /\b(the\s+)?([A-Z]{2,}(?:\s+[A-Z]{2,})*)\b/g;

// Auto-format action lines
export function formatActionLine(text: string): string {
  let formatted = text;
  
  // 1. Capitalize key sounds
  const soundPattern = createSoundPattern();
  formatted = formatted.replace(soundPattern, match => match.toUpperCase());
  
  // 2. Handle character first appearances
  const words = formatted.split(/\s+/);
  const processedRanges: [number, number][] = [];
  
  // Look for sequences of 2-4 capitalized words that could be character names
  for (let i = 0; i < words.length - 1; i++) {
    if (isCapitalizedWord(words[i])) {
      let j = i + 1;
      while (j < words.length && j < i + 4 && isCapitalizedWord(words[j])) {
        j++;
      }
      
      if (j - i >= 2 && j - i <= 4) {
        // Found potential character name
        const potentialName = words.slice(i, j).join(' ');
        if (potentialName.length <= 30 && !KEY_SOUNDS.includes(potentialName.toUpperCase())) {
          // Mark this range as processed
          processedRanges.push([i, j]);
          i = j - 1; // Skip processed words
        }
      }
    }
  }
  
  // Apply character formatting
  let rebuiltText = '';
  let currentPos = 0;
  
  processedRanges.forEach(([start, end]) => {
    // Add text before this range
    rebuiltText += words.slice(currentPos, start).join(' ');
    if (currentPos < start) rebuiltText += ' ';
    
    // Add uppercased character name
    rebuiltText += words.slice(start, end).join(' ').toUpperCase();
    currentPos = end;
  });
  
  // Add remaining text
  if (currentPos < words.length) {
    if (currentPos > 0) rebuiltText += ' ';
    rebuiltText += words.slice(currentPos).join(' ');
  }
  
  formatted = rebuiltText || formatted;
  
  // 3. Format mini-slugs
  if (MINI_SLUG_PATTERN.test(formatted.trim())) {
    formatted = formatted.toUpperCase();
  }
  
  // 4. Handle specific screenplay conventions
  formatted = formatted
    // Time of day in scene headings
    .replace(/\b(DAWN|SUNRISE|MORNING|DAY|NOON|AFTERNOON|DUSK|SUNSET|EVENING|NIGHT|MIDNIGHT)\b/gi, 
      match => match.toUpperCase())
    // Camera directions when at start of line
    .replace(/^(CLOSE ON|ANGLE ON|FAVOR|FAVORING|PUSH IN|PULL BACK|PAN|TILT|TRACK|DOLLY)/i, 
      match => match.toUpperCase())
    // Important screenplay terms
    .replace(/\b(V\.O\.|O\.S\.|O\.C\.|CONT\'D|CONTINUED|PRELAP|INTERCUT|MATCH CUT)\b/gi, 
      match => match.toUpperCase());
  
  return formatted;
}

// Helper to check if a word is capitalized (but not all caps)
function isCapitalizedWord(word: string): boolean {
  if (!word || word.length === 0) return false;
  
  // Remove common punctuation
  const cleaned = word.replace(/[.,;:!?'"]/g, '');
  if (!cleaned) return false;
  
  // Check if first letter is capital and not all letters are capitals
  return /^[A-Z]/.test(cleaned) && cleaned !== cleaned.toLowerCase() && cleaned !== cleaned.toUpperCase();
}

// Plugin to auto-format action lines as user types
export const actionFormatterPlugin = ViewPlugin.fromClass(class {
  update(update: ViewUpdate) {
    if (!update.docChanged) return;
    
    // Process each changed line
    update.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
      const startLine = update.view.state.doc.lineAt(fromB);
      const endLine = update.view.state.doc.lineAt(toB);
      
      for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
        const line = update.view.state.doc.line(lineNum);
        const text = line.text;
        
        // Skip if it's not an action line (basic check)
        if (!text || 
            /^(INT|EXT|EST)[\.\s]/i.test(text) ||
            /^[A-Z][A-Z\s]{2,30}$/.test(text.trim()) ||
            /^\([^)]+\)$/.test(text.trim()) ||
            text.trim().endsWith(':')) {
          continue;
        }
        
        // Apply formatting
        const formatted = formatActionLine(text);
        
        if (formatted !== text) {
          // Schedule the update for the next frame to avoid conflicts
          setTimeout(() => {
            update.view.dispatch({
              changes: { from: line.from, to: line.to, insert: formatted }
            });
          }, 0);
        }
      }
    });
  }
});

// Helper to insert sound effect
export function insertSoundEffect(sound: string): string {
  return `SFX: ${sound.toUpperCase()}`;
}

// Helper to format character entrance
export function formatCharacterEntrance(name: string, age?: number, description?: string): string {
  let entrance = name.toUpperCase();
  
  if (age) {
    entrance += ` (${age}`;
    if (description) {
      entrance += `, ${description}`;
    }
    entrance += ')';
  } else if (description) {
    entrance += ` (${description})`;
  }
  
  return entrance;
}

// Helper to format time jump
export function formatTimeJump(jump: string): string {
  const timeJumps = [
    'LATER', 'MOMENTS LATER', 'HOURS LATER', 'DAYS LATER', 'WEEKS LATER',
    'MONTHS LATER', 'YEARS LATER', 'CONTINUOUS', 'SAME TIME', 'EARLIER',
    'PREVIOUSLY', 'MEANWHILE', 'ELSEWHERE'
  ];
  
  const upperJump = jump.toUpperCase();
  if (timeJumps.includes(upperJump)) {
    return `\n${upperJump}\n\n`;
  }
  
  return jump;
}