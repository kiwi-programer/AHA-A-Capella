(function () {
  const CONTENT_DEFAULTS = {
    heroTitle: 'Welcome to <span>AHA!</span>',
    heroSubtitle: 'A Cappella Harmonic Association',
    mottoLabel: 'Our Motto',
    mottoText: '"One Voice. Many Hearts."',
    mottoExplain: 'We all sing as one united voice with different harmonies — many voices, one purpose, endless heart.',
    homeCard1Title: 'Events & Meetups',
    homeCard1Desc: 'Find upcoming rehearsals, performances, and social hangouts. Suggest your own meetup!',
    homeCard2Title: 'Song Suggestions',
    homeCard2Desc: 'Share a song idea with the group and help shape the next setlist.',
    homeCard3Title: 'Get in Touch',
    homeCard3Desc: 'Questions, ideas, or want to join AHA? We\'d love to hear from you!',
    pocoStoryTitle: 'Meet Poco, the Piano Penguin 🐧',
    pocoStoryBody: 'Poco once had an idea — a spark of passion to bring voices together at school. One by one, they gathered singers, building a group from nothing but a dream. With vision and heart, Poco led that choir forward, and what began as an idea blossomed into AHA!: a talented, tight-knit group of singers who perform with harmony and purpose. Poco is our mascot, our origin story, and our reminder that great things start with one voice.',
    eventsTitle: '📅 Events',
    eventsSubtitle: 'Upcoming hangouts, rehearsals & performances',
    upcomingEventsLabel: 'Upcoming Events',
    event1Title: 'Weekly Rehearsal 🎤',
    event1Body: 'Regular group rehearsal — all members welcome. Bring your sheet music and warm up those vocals!',
    event2Title: 'Summer Kickoff Social 🌟',
    event2Body: 'Casual hangout to celebrate the end of the school year. Snacks, games, and of course, singing!',
    event3Title: 'Independence Day Performance 🎆',
    event3Body: 'AHA! will be performing at the community block party. Come cheer us on or join us on stage!',
    event4Title: 'New Member Meet & Greet 🐧',
    event4Body: 'Interested in joining AHA!? Come meet the team, learn our story, and try singing with us for the first time!',
    meetupLabel: 'Suggest a Meetup',
    songsTitle: '🎵 Song Suggestions',
    songsSubtitle: 'Submit new ideas',
    songLabel: 'Suggest a Song',
    contactTitle: '✉️ Contact',
    contactSubtitle: 'Say hello · ask questions · share ideas',
    messageLabel: 'Send a Message',
    aboutLabel: 'About AHA!',
    contactCardTitle: 'We\'d love to hear from you!',
    contactLocationTitle: 'Location',
    contactLocationBody: 'School rehearsal room & community spaces. Check Events for specific locations!',
    contactRehearsalsTitle: 'Rehearsals',
    contactRehearsalsBody: 'Weekly — see the Events page for the current schedule.',
    contactMembersTitle: 'New Members',
    contactMembersBody: 'All voices welcome! No experience necessary — just passion and heart.',
    contactMascotTitle: 'Mascot',
    contactMascotBody: 'Poco the Piano Penguin — founder, dreamer, and forever our guide.'
  };

  function getElements(root) {
    return Array.from(root.querySelectorAll('[data-edit-key]'));
  }

  function applyContent(content = {}, root = document) {
    const merged = { ...CONTENT_DEFAULTS, ...content };
    getElements(root).forEach((element) => {
      const key = element.dataset.editKey;
      if (Object.prototype.hasOwnProperty.call(merged, key)) {
        element.innerHTML = merged[key];
      }
    });
    return merged;
  }

  function collectContent(root = document) {
    const content = {};
    getElements(root).forEach((element) => {
      content[element.dataset.editKey] = element.innerHTML;
    });
    return content;
  }

  async function loadContent(apiBase) {
    if (!apiBase) return CONTENT_DEFAULTS;
    const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/content`, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`Failed to load content: ${response.status}`);
    }
    const data = await response.json();
    return data.content || data || {};
  }

  async function saveContent(apiBase, accessToken, content) {
    if (!apiBase) throw new Error('API base URL is required');
    const response = await fetch(`${apiBase.replace(/\/$/, '')}/api/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ content })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Save failed: ${response.status}`);
    }
    return response.json();
  }

  function setEditable(enabled, root = document) {
    getElements(root).forEach((element) => {
      element.setAttribute('contenteditable', enabled ? 'true' : 'false');
      element.setAttribute('spellcheck', 'false');
    });
  }

  window.AHASiteContent = {
    defaults: CONTENT_DEFAULTS,
    applyContent,
    collectContent,
    loadContent,
    saveContent,
    setEditable,
    getElements
  };
})();
