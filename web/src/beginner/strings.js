// Every word the Beginner view shows, in English and Tamil. Short on purpose: pictures carry the meaning.
// Tamil wording should be checked by a native speaker before wide use.
export const LANGS = [{ id: 'en', label: 'English', speech: 'en-IN' }, { id: 'ta', label: 'தமிழ்', speech: 'ta-IN' }]

const EN = {
  where: 'Where is the water?', village: 'Is my village flooded?', watch: 'Watch the flood', how: 'How does it work?',
  hello: "Hi! I'm Tamizhi. I watch floods from space.",
  helloWhere: 'Blue on the map = flood water.',
  picture: 'Satellite picture', notLive: 'A picture, not a live camera', daysAgo: (n) => (n <= 0 ? 'today' : n === 1 ? '1 day ago' : `${n} days ago`),
  flood: 'Flood water', maybe: 'Maybe flood', river: 'River (normal)',
  tWater: 'Land under water', tPeople: 'People living there', tFarm: 'Farms under water',
  maybeMore: (x) => `+ ${x} maybe`, acres: 'acres', rai: 'rai', km2: 'km²', people: 'people', lakh: 'lakh',
  waterLine: (d) => `under water on ${d}`, farmLine: (d) => `of farms under water on ${d}`,
  peopleLine: 'live where the water is', notHurt: 'Living there does not mean hurt. Ask local officials.',
  each: (n) => `Each person = ${n}`, sure: 'Sure', maybeShort: 'Maybe',
  villageAsk: 'Type your village or town', find: 'Find', orTap: 'or tap the map', searching: 'Looking…',
  notFound: 'Not found in this flood area. Try another name, or tap the map.',
  ansFlood: 'Flooded', ansMaybe: 'Maybe flooded', ansDry: 'Dry', ansRiver: 'River or lake (normal water)', ansNone: 'No satellite picture here',
  onDay: (d) => `on ${d}`, otherDays: 'See other days', tapAgain: 'Tap another spot to check it',
  play: 'Play', pause: 'Pause', before: 'Before', during: 'Flood', after: 'After', mostWater: 'Most water!', level: 'Water level',
  noPic: 'No picture this day',
  c1: 'I fly high above the Earth.', c2: 'My radar sees through clouds, even at night.', c3: 'Calm water is like a mirror. It looks dark to me.',
  c4: 'New dark water? That is a flood!', cEnd: 'Now check your village!',
  next: 'Next', back: 'Back', close: 'Close', listen: 'Listen', start: 'Start',
  loading: 'Loading…', loadingEvent: (t) => `Loading ${t}…`, home: 'Back to the globe', level_: 'Level', lang: 'Language',
  modelledNote: 'Pictures come every few days.',
  game: 'Raise the river', gameHello: 'What if the river rises? Slide and watch which land goes under first.',
  gameTag: 'What if? A game, not a satellite picture', riseBy: (m) => `River up by ${m} m`, gameLand: 'Land under water in this game',
  showReal: (d) => `Show the real flood (${d})`, gameAsk: 'Does the real flood (cyan) sit on the low land? Look and see!',
  gameKey: 'Game water', gameLow: 'Low', gameHigh: 'High',
  season: 'The whole season here', underFor: (a, b) => (b == null ? `Under water at least ${a} days` : a === b ? `Under water about ${a} days` : `Under water for ${a}–${b} days`),
  dryBy: (d) => `Dry again by ${d}`, notDryYet: (d) => `Still wet on ${d}`, cameBack: 'The water came back once it had dried', neverWet: 'Not flooded at any time this season',
  wetFrom: (a, b) => (a === b ? `Seen flooded on ${a}` : `Seen flooded ${a} → ${b}`),
}

const TA = {
  where: 'தண்ணீர் எங்கே?', village: 'என் ஊரில் வெள்ளமா?', watch: 'வெள்ளத்தைப் பாருங்கள்', how: 'இது எப்படி வேலை செய்கிறது?',
  hello: 'வணக்கம்! நான் தமிழி. விண்வெளியிலிருந்து வெள்ளத்தைப் பார்க்கிறேன்.',
  helloWhere: 'வரைபடத்தில் நீலம் = வெள்ள நீர்.',
  picture: 'செயற்கைக்கோள் படம்', notLive: 'இது படம், நேரடி கேமரா அல்ல', daysAgo: (n) => (n <= 0 ? 'இன்று' : `${n} நாட்களுக்கு முன்`),
  flood: 'வெள்ள நீர்', maybe: 'வெள்ளம் இருக்கலாம்', river: 'ஆறு (வழக்கமான நீர்)',
  tWater: 'நீரில் மூழ்கிய நிலம்', tPeople: 'அங்கு வாழும் மக்கள்', tFarm: 'நீரில் மூழ்கிய வயல்கள்',
  maybeMore: (x) => `+ ${x} இருக்கலாம்`, acres: 'ஏக்கர்', rai: 'ராய்', km2: 'ச.கி.மீ', people: 'மக்கள்', lakh: 'லட்சம்',
  waterLine: (d) => `${d} அன்று நீரில் மூழ்கியது`, farmLine: (d) => `${d} அன்று நீரில் மூழ்கிய வயல்`,
  peopleLine: 'தண்ணீர் உள்ள இடத்தில் வாழ்கிறார்கள்', notHurt: 'அங்கு வாழ்வதால் பாதிப்பு என்று பொருள் இல்லை. உள்ளூர் அதிகாரிகளிடம் கேளுங்கள்.',
  each: (n) => `ஒரு உருவம் = ${n} பேர்`, sure: 'உறுதி', maybeShort: 'இருக்கலாம்',
  villageAsk: 'உங்கள் ஊர் பெயரை எழுதுங்கள்', find: 'தேடு', orTap: 'அல்லது வரைபடத்தைத் தொடுங்கள்', searching: 'தேடுகிறது…',
  notFound: 'இந்த வெள்ளப் பகுதியில் கிடைக்கவில்லை. வேறு பெயரை முயலுங்கள், அல்லது வரைபடத்தைத் தொடுங்கள்.',
  ansFlood: 'வெள்ளம் உள்ளது', ansMaybe: 'வெள்ளம் இருக்கலாம்', ansDry: 'உலர்ந்து உள்ளது', ansRiver: 'ஆறு அல்லது ஏரி (வழக்கமான நீர்)', ansNone: 'இங்கு செயற்கைக்கோள் படம் இல்லை',
  onDay: (d) => `${d} அன்று`, otherDays: 'மற்ற நாட்களைப் பாருங்கள்', tapAgain: 'வேறு இடத்தைத் தொட்டுப் பாருங்கள்',
  play: 'இயக்கு', pause: 'நிறுத்து', before: 'முன்', during: 'வெள்ளம்', after: 'பின்', mostWater: 'அதிக நீர்!', level: 'நீர் மட்டம்',
  noPic: 'இந்த நாளில் படம் இல்லை',
  c1: 'நான் பூமிக்கு மேலே உயரத்தில் பறக்கிறேன்.', c2: 'என் ரேடார் மேகங்களைத் தாண்டி, இரவிலும் பார்க்கும்.', c3: 'அமைதியான நீர் கண்ணாடி போன்றது. அது எனக்குக் கருப்பாகத் தெரியும்.',
  c4: 'புதிய கருப்பு நீரா? அதுதான் வெள்ளம்!', cEnd: 'இப்போது உங்கள் ஊரைப் பாருங்கள்!',
  next: 'அடுத்து', back: 'பின்செல்', close: 'மூடு', listen: 'கேளுங்கள்', start: 'தொடங்கு',
  loading: 'ஏற்றுகிறது…', loadingEvent: (t) => `${t} ஏற்றுகிறது…`, home: 'உலக உருண்டைக்குத் திரும்பு', level_: 'நிலை', lang: 'மொழி',
  modelledNote: 'சில நாட்களுக்கு ஒருமுறை படம் வரும்.',
  game: 'ஆற்றை உயர்த்து', gameHello: 'ஆறு உயர்ந்தால் என்ன ஆகும்? நகர்த்திப் பாருங்கள்: எந்த நிலம் முதலில் மூழ்கும்?',
  gameTag: '"என்ன ஆகும்?" விளையாட்டு, செயற்கைக்கோள் படம் அல்ல', riseBy: (m) => `ஆறு ${m} மீ உயர்ந்தது`, gameLand: 'இந்த விளையாட்டில் மூழ்கிய நிலம்',
  showReal: (d) => `உண்மையான வெள்ளத்தைக் காட்டு (${d})`, gameAsk: 'உண்மையான வெள்ளம் (நீலப்பச்சை) தாழ்வான நிலத்தில்தான் உள்ளதா? பார்த்துச் சொல்லுங்கள்!',
  gameKey: 'விளையாட்டு நீர்', gameLow: 'குறைவு', gameHigh: 'அதிகம்',
  season: 'இந்தப் பருவம் முழுவதும் இங்கே', underFor: (a, b) => (b == null ? `குறைந்தது ${a} நாட்கள் நீரில்` : a === b ? `சுமார் ${a} நாட்கள் நீரில்` : `${a}–${b} நாட்கள் நீரில்`),
  dryBy: (d) => `${d} அன்று மீண்டும் உலர்ந்தது`, notDryYet: (d) => `${d} அன்றும் நீர் உள்ளது`, cameBack: 'உலர்ந்த பிறகு மீண்டும் நீர் வந்தது', neverWet: 'இந்தப் பருவத்தில் வெள்ளம் வரவில்லை',
  wetFrom: (a, b) => (a === b ? `${a} அன்று வெள்ளம்` : `${a} → ${b} வெள்ளம்`),
}

export const STRINGS = { en: EN, ta: TA }
// Place names for the event chips.
export const PLACES = { assam: { en: 'Assam', ta: 'அசாம்' }, chennai: { en: 'Chennai', ta: 'சென்னை' }, thailand: { en: 'Thailand', ta: 'தாய்லாந்து' } }
