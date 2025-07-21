// Screenplay element types based on Hollywood standard formatting
export enum ScreenplayElement {
  SceneHeading = 'scene-heading',
  Action = 'action',
  Character = 'character',
  Parenthetical = 'parenthetical',
  Dialogue = 'dialogue',
  Transition = 'transition',
  Shot = 'shot',
  Montage = 'montage',
  DualDialogue = 'dual-dialogue',
  TitlePage = 'title-page',
  General = 'general'
}

// Formatting configuration for each element type
export interface ElementFormatting {
  leftIndent: number; // in inches from page left edge
  rightMargin: number; // in inches from page right edge
  textCase: 'uppercase' | 'lowercase' | 'sentence' | 'preserve';
  alignment: 'left' | 'center' | 'right';
  beforeSpacing: boolean;
  afterSpacing: boolean;
}

// Standard Hollywood screenplay formatting rules
export const SCREENPLAY_FORMATS: Record<ScreenplayElement, ElementFormatting> = {
  [ScreenplayElement.SceneHeading]: {
    leftIndent: 0,  // Already at page margin
    rightMargin: 0,
    textCase: 'uppercase',
    alignment: 'left',
    beforeSpacing: true,
    afterSpacing: true
  },
  [ScreenplayElement.Action]: {
    leftIndent: 0,  // Already at page margin
    rightMargin: 0,
    textCase: 'sentence',
    alignment: 'left',
    beforeSpacing: false,
    afterSpacing: true
  },
  [ScreenplayElement.Character]: {
    leftIndent: 2.2,  // 3.7" from left edge - 1.5" page margin
    rightMargin: 0,
    textCase: 'uppercase',
    alignment: 'left',  // Will fix centering in CSS
    beforeSpacing: true,
    afterSpacing: false
  },
  [ScreenplayElement.Parenthetical]: {
    leftIndent: 1.5,  // 3.0" from left edge - 1.5" page margin
    rightMargin: 2.0,
    textCase: 'lowercase',
    alignment: 'left',
    beforeSpacing: false,
    afterSpacing: false
  },
  [ScreenplayElement.Dialogue]: {
    leftIndent: 1.0,  // 2.5" from left edge - 1.5" page margin
    rightMargin: 1.5,  // Creates 3.5" dialogue width
    textCase: 'preserve',
    alignment: 'left',
    beforeSpacing: false,
    afterSpacing: true
  },
  [ScreenplayElement.Transition]: {
    leftIndent: 4.0,  // For right-aligned text
    rightMargin: 0,
    textCase: 'uppercase',
    alignment: 'right',
    beforeSpacing: true,
    afterSpacing: true
  },
  [ScreenplayElement.Shot]: {
    leftIndent: 0,  // Already at page margin
    rightMargin: 0,
    textCase: 'uppercase',
    alignment: 'left',
    beforeSpacing: true,
    afterSpacing: true
  },
  [ScreenplayElement.Montage]: {
    leftIndent: 0,  // Already at page margin
    rightMargin: 0,
    textCase: 'uppercase',
    alignment: 'left',
    beforeSpacing: true,
    afterSpacing: true
  },
  [ScreenplayElement.DualDialogue]: {
    leftIndent: 2.5,
    rightMargin: 2.5,
    textCase: 'preserve',
    alignment: 'left',
    beforeSpacing: false,
    afterSpacing: true
  },
  [ScreenplayElement.TitlePage]: {
    leftIndent: 0,
    rightMargin: 0,
    textCase: 'preserve',
    alignment: 'center',
    beforeSpacing: false,
    afterSpacing: false
  },
  [ScreenplayElement.General]: {
    leftIndent: 1.5,
    rightMargin: 1.0,
    textCase: 'preserve',
    alignment: 'left',
    beforeSpacing: false,
    afterSpacing: false
  }
};

// Detection patterns for screenplay elements
export const ELEMENT_PATTERNS = {
  sceneHeading: /^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)\s/i,
  transition: /(TO:|OUT\.)$/i,
  character: /^[A-Z][A-Z0-9\s\-\'\.]+(\s*\([A-Z\.\s]+\))?$/,
  parenthetical: /^\([^)]+\)$/,
  shot: /^(CLOSE ON|ANGLE ON|POV|INSERT|WIDE|ESTABLISHING|AERIAL VIEW|EXTREME CLOSE-UP|CLOSE-UP|MEDIUM SHOT|WIDE SHOT|TWO SHOT|OVER THE SHOULDER|TRACKING SHOT|PAN|TILT|ZOOM|DOLLY|CRANE SHOT|STEADICAM|HANDHELD|FREEZE FRAME|SLOW MOTION|TIME LAPSE|FLASHBACK|FLASH FORWARD|DREAM SEQUENCE|MONTAGE|SERIES OF SHOTS|INTERCUT|SPLIT SCREEN|STOCK SHOT|MATCH CUT|JUMP CUT|SMASH CUT|FADE IN|FADE OUT|FADE TO|CUT TO|DISSOLVE TO|WIPE TO|IRIS IN|IRIS OUT|BLACKOUT|WHITEOUT|TITLE CARD|SUBTITLE|SUPER|CHYRON|CRAWL|ROLL|GRAPHIC|ANIMATION|CGI|VFX|SFX|PRACTICAL EFFECT|MATTE PAINTING|GREEN SCREEN|BLUE SCREEN|COMPOSITE|ROTOSCOPE|MOTION CAPTURE|PERFORMANCE CAPTURE|VIRTUAL PRODUCTION|LED WALL|VOLUME|PREVIS|POSTVIS|TECHVIS|STORYBOARD|ANIMATIC|CONCEPT ART|PRODUCTION DESIGN|SET DESIGN|COSTUME DESIGN|MAKEUP DESIGN|PROSTHETICS|SPECIAL MAKEUP|HAIR DESIGN|PROP DESIGN|VEHICLE DESIGN|CREATURE DESIGN|CHARACTER DESIGN|ENVIRONMENT DESIGN|LIGHTING DESIGN|SOUND DESIGN|MUSIC|SCORE|SOUNDTRACK|FOLEY|ADR|DIALOGUE|VOICEOVER|NARRATION|AMBIENCE|ROOM TONE|WILD SOUND|PRODUCTION SOUND|POST SOUND|MIX|DUB|M&E|STEMS|LFE|SURROUND|ATMOS|BINAURAL|IMMERSIVE|INTERACTIVE|VR|AR|MR|XR|360|VOLUMETRIC|HOLOGRAPHIC|STEREOSCOPIC|3D|4D|HFR|HDR|WCG|ACES|DCI|IMF|DCP|DSM|KDM|CPL|PKL|ASSETMAP|VOLINDEX|COMPOSITION|REEL|VERSION|LOCALE|TERRITORY|RATING|CREDIT|TITLE|END CREDIT|CRAWL|LOGO|IDENT|BUMPER|SLATE|LEADER|COUNTDOWN|SYNC|TIMECODE|KEYCODE|EDGECODE|FRAMECODE|FOOTAGE|REEL|SHOT|TAKE|SCENE|SEQUENCE|ACT|EPISODE|SEASON|SERIES|FILM|MOVIE|FEATURE|SHORT|DOCUMENTARY|NARRATIVE|EXPERIMENTAL|AVANT-GARDE|UNDERGROUND|INDEPENDENT|STUDIO|BLOCKBUSTER|TENTPOLE|FRANCHISE|SEQUEL|PREQUEL|REBOOT|REMAKE|ADAPTATION|ORIGINAL|SPEC|COMMISSION|DEVELOPMENT|PREPRODUCTION|PRODUCTION|POSTPRODUCTION|DISTRIBUTION|EXHIBITION|RELEASE|PREMIERE|FESTIVAL|MARKET|SCREENING|TEST|PREVIEW|FOCUS GROUP|RESHOOT|PICKUP|ADDITIONAL|INSERT|CUTAWAY|REACTION|COVERAGE|MASTER|SINGLE|DOUBLE|TRIPLE|QUAD|GROUP|CROWD|ESTABLISHING|BEAUTY|DRONE|HELICOPTER|UNDERWATER|MOTION CONTROL|TIMELAPSE|HYPERLAPSE|SLOMO|HIGHSPEED|PHANTOM|ARRI|RED|SONY|BLACKMAGIC|CANON|NIKON|PANASONIC|FUJI|HASSELBLAD|IMAX|VISTAVISION|SUPER35|ANAMORPHIC|SPHERICAL|FULLFRAME|ACADEMY|FLAT|SCOPE|CINEMASCOPE|PANAVISION|TECHNICOLOR|TECHNIRAMA|TODD-AO|CINERAMA|SUPER8|16MM|35MM|65MM|70MM|DIGITAL|FILM|ANALOG|HYBRID|RAW|LOG|REC709|REC2020|REC2100|P3|ALEXA|VENICE|MONSTRO|HELIUM|GEMINI|KOMODO|RAPTOR|URSA|C300|C500|C700|FX9|FX6|A7S|S1H|GH5|XT4|H6D|PHASE|LEAF|MAMIYA|PENTAX|LEICA|ZEISS|COOKE|ANGENIEUX|FUJINON|SIGMA|TAMRON|TOKINA|SAMYANG|ROKINON|LAOWA|SIRUI|VILTROX|METABONES|SPEEDBOOSTER|ADAPTER|MOUNT|FILTER|ND|POLARIZER|UV|IR|DIFFUSION|PROMIST|GLIMMERGLASS|PEARLESCENT|SOFTFX|DIOPTER|SPLIT|GRAD|COLOR|CORRECTION|CONVERSION|TUNGSTEN|DAYLIGHT|FLUORESCENT|LED|HMI|XENON|HALOGEN|INCANDESCENT|PRACTICAL|NATURAL|AVAILABLE|AMBIENT|KEY|FILL|BACK|RIM|KICK|HAIR|EYE|BACKGROUND|SET|MOTIVATING|UNMOTIVATED|SOURCE|BOUNCE|NEGATIVE|FLAG|CUTTER|SCRIM|SILK|DIFFUSION|REFLECTOR|MIRROR|GOBO|COOKIE|CUCOLORIS|BRANCHALORIS|PATTERN|BREAKUP|SHADOW|HIGHLIGHT|CONTRAST|RATIO|EXPOSURE|APERTURE|SHUTTER|ISO|GAIN|LATITUDE|DYNAMIC|RANGE|CLIPPING|CRUSH|NOISE|GRAIN|ARTIFACT|COMPRESSION|CODEC|BITRATE|RESOLUTION|FRAMERATE|ASPECT|RATIO|PIXEL|SENSOR|BAYER|MOSAIC|DEBAYER|DEMOSAIC|INTERPOLATION|ALIASING|MOIRE|ROLLING|GLOBAL|SHUTTER|SYNC|GENLOCK|JAM|SCRATCH|REFERENCE|GUIDE|OFFLINE|ONLINE|CONFORM|GRADE|COLOR|CORRECTION|PRIMARY|SECONDARY|POWER|WINDOW|SHAPE|MASK|KEY|QUALIFIER|HUE|SATURATION|LUMINANCE|LIFT|GAMMA|GAIN|OFFSET|CONTRAST|PIVOT|HIGHLIGHT|SHADOW|MIDTONE|BLACK|WHITE|BALANCE|TEMPERATURE|TINT|MAGENTA|GREEN|LUT|CDL|ASC|ACES|OCIO|COLORSPACE|TRANSFORM|GAMUT|TRANSFER|FUNCTION|CURVE|LINEARIZATION|DELINEARIZATION|NORMALIZATION|DENORMALIZATION|QUANTIZATION|DEQUANTIZATION|ENCODING|DECODING|COMPRESSION|DECOMPRESSION|TRANSCODE|RENDER|EXPORT|IMPORT|INGEST|BACKUP|ARCHIVE|RESTORE|MIGRATE|CONSOLIDATE|TRIM|OPTIMIZE|PACKAGE|DELIVER|UPLOAD|DOWNLOAD|STREAM|BROADCAST|MULTICAST|UNICAST|LIVE|DELAY|BUFFER|CACHE|CDN|EDGE|ORIGIN|MANIFEST|PLAYLIST|SEGMENT|CHUNK|FRAGMENT|PACKET|FRAME|FIELD|SAMPLE|PIXEL|VOXEL|POINT|CLOUD|MESH|TEXTURE|SHADER|MATERIAL|LIGHTING|RENDERING|COMPOSITING|ROTO|PAINT|CLEANUP|REMOVAL|REPLACEMENT|AUGMENTATION|ENHANCEMENT|RESTORATION|STABILIZATION|TRACKING|MATCHMOVE|LAYOUT|BLOCKING|ANIMATIC|PREVIS|TECHVIS|POSTVIS|FINAL|LOCKED|APPROVED|REJECTED|REVISION|VERSION|ITERATION|PASS|LAYER|CHANNEL|ALPHA|MATTE|HOLDOUT|GARBAGE|EDGE|CORE|DETAIL|DESPILL|SUPPRESSION|ADDITIVE|SCREEN|MULTIPLY|OVERLAY|SOFTLIGHT|HARDLIGHT|COLORDODGE|COLORBURN|DARKEN|LIGHTEN|DIFFERENCE|EXCLUSION|HUE|SATURATION|COLOR|LUMINOSITY|NORMAL|DISSOLVE|BEHIND|CLEAR|SRC|DST|OVER|IN|OUT|ATOP|XOR|PLUS|MINUS|DIFF|BLEND|MIX|COMP|PRECOMP|NEST|COLLAPSE|RASTERIZE|VECTOR|BITMAP|RESOLUTION|INDEPENDENT|DEPENDENT|PROXY|PREVIEW|PLAYBACK|REALTIME|CACHE|RAM|DISK|GPU|CPU|THREAD|CORE|NODE|FARM|QUEUE|JOB|TASK|PROCESS|PIPELINE|WORKFLOW|AUTOMATION|SCRIPT|EXPRESSION|PLUGIN|EXTENSION|INTEGRATION|API|SDK|FRAMEWORK|LIBRARY|MODULE|PACKAGE|DEPENDENCY|BUILD|COMPILE|LINK|DEBUG|PROFILE|OPTIMIZE|DEPLOY|RELEASE|PATCH|UPDATE|UPGRADE|MAINTAIN|SUPPORT|DOCUMENT|TRAIN|CONSULT)/i,
  montage: /^(MONTAGE|SERIES OF SHOTS)/i,
  fadeIn: /^FADE IN:?$/i
};

// Smart key navigation flow
export const ELEMENT_FLOW = {
  [ScreenplayElement.SceneHeading]: ScreenplayElement.Action,
  // From an Action line a single Enter should create another Action paragraph
  // Final Draft opens the element picker on a blank Action line (double Enter)
  [ScreenplayElement.Action]: ScreenplayElement.Action,
  [ScreenplayElement.Character]: ScreenplayElement.Dialogue,
  [ScreenplayElement.Parenthetical]: ScreenplayElement.Dialogue,
  [ScreenplayElement.Dialogue]: ScreenplayElement.Action,
  [ScreenplayElement.Transition]: ScreenplayElement.SceneHeading,
  [ScreenplayElement.Shot]: ScreenplayElement.Action,
  [ScreenplayElement.Montage]: ScreenplayElement.Action,
  [ScreenplayElement.DualDialogue]: ScreenplayElement.Action,
  [ScreenplayElement.General]: ScreenplayElement.Action
};

// Tab key cycle order
export const TAB_CYCLE_ORDER = [
  ScreenplayElement.SceneHeading,
  ScreenplayElement.Action,
  ScreenplayElement.Character,
  ScreenplayElement.Dialogue,
  ScreenplayElement.Parenthetical,
  ScreenplayElement.Transition,
  ScreenplayElement.Shot
];