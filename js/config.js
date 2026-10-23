/* ==========================================================================
   Chaajao Analytics - CONFIG (sab settings yahin hain)
   Naya push karne par sirf "version" badal dein, phone khud update ho jayega.
   ========================================================================== */
var CONFIG = {
  appName: 'Chaajao Analytics',
  version: '5.0.0',            // BUMP THIS on every push (sw.js cache name isi se banta hai)
  schemaVersion: 3,            // data ki shape badle to isay badhayein (purana cache khud ud jata hai)

  sheet: {
    id: '1MG7nZhr4L7cORXWL5FTuTPUDn0354bpqlq4RrzZNZQo',
    tabName: 'Weekly Engagment',   // tab ka naam (spelling sheet jaisi hi)
    gid: '',                       // RECOMMENDED: tab ka gid (sheet URL mein #gid=XXXX). Khali ho to gviz use hota hai,
                                   // jo mixed cells (jaise " 1,084") kabhi kabhi khali kar deta hai.
    timeoutMs: 15000,
    refreshMinutes: 5
  },

  /* Platform ki list. aliases = sheet header ke mumkin naam (case/space/line-break ignore hote hain).
     "facebook" ke do sources hain: pehle "Follows", na mile to purani tareekhon ke liye "Likes". */
  platforms: [
    { key: 'linkedin',  label: 'LinkedIn',         group: 'social',   color: '#0A66C2', icon: 'i-linkedin',  url: 'https://www.linkedin.com/company/chaajao',
      aliases: ['linkdin', 'linkedin'] },
    { key: 'youtube',   label: 'YouTube',          group: 'social',   color: '#E02D2D', icon: 'i-youtube',   url: 'https://www.youtube.com/@chaajao',
      aliases: ['youtube subscriber', 'youtube subscribers', 'youtube'] },
    { key: 'facebook',  label: 'Facebook',         group: 'social',   color: '#1877F2', icon: 'i-facebook',  url: 'https://www.facebook.com/chaajao',
      aliases: ['facebook follows', 'facebook follow', 'facebook followers'],
      fallbackAliases: ['facebook likes', 'facebook like'],
      metrics: { main: 'Follows', fallback: 'Likes' } },
    { key: 'instagram', label: 'Instagram',        group: 'social',   color: '#E1306C', icon: 'i-instagram', url: 'https://www.instagram.com/chaajao__edu/',
      aliases: ['instagram'] },
    { key: 'tiktok',    label: 'TikTok',           group: 'social',   color: '#EE8B3A', icon: 'i-tiktok',    url: 'https://www.tiktok.com/@chaajao_edu',
      aliases: ['tiktok', 'tik tok'] },
    { key: 'wa_main',   label: 'WhatsApp Channel', group: 'whatsapp', color: '#1FA855', icon: 'i-whatsapp',  url: 'https://whatsapp.com/channel/0029VaLqFDgFy72BmpzRqb45',
      aliases: ['whatsapp channel', 'whatsapp channel main'] },
    { key: 'wa_mdcat',  label: 'WA MDCAT',         group: 'whatsapp', color: '#059669', icon: 'i-whatsapp',  url: 'https://whatsapp.com/channel/0029VbB7OEF72WTuSLtPfh0f',
      aliases: ['whatsapp channel mdcat', 'whatsapp mdcat'] },
    { key: 'wa_ecat',   label: 'WA ECAT',          group: 'whatsapp', color: '#3B82F6', icon: 'i-whatsapp',  url: 'https://whatsapp.com/channel/0029VbBED3HHltY2EwNPfU2J',
      aliases: ['whatsapp channel ecat', 'whatsapp ecat'] },
    { key: 'wa_bcat',   label: 'WA BCAT',          group: 'whatsapp', color: '#8B5CF6', icon: 'i-whatsapp',  url: 'https://whatsapp.com/channel/0029VbCH5caL7UVZ6UIHvA3J',
      aliases: ['whatsapp channel bcat', 'whatsapp bcat'] },
    { key: 'wa_cb',     label: 'College Board',    group: 'whatsapp', color: '#DC2626', icon: 'i-whatsapp',  url: '',
      aliases: ['whatsapp college board', 'whatsapp channel college board'] },
    { key: 'wa_inter',  label: 'Intermediate',     group: 'whatsapp', color: '#0D9488', icon: 'i-whatsapp',  url: '',
      aliases: ['whatsapp intermediate', 'whatsapp channel intermediate'] }
  ],
  groups: { social: 'Social Platforms', whatsapp: 'WhatsApp Channels' },

  dateHeaderAliases: ['date', 'tareekh'],   // column A ka header
  dateOrder: 'auto',                         // 'auto' | 'dmy' | 'mdy' (sirf 12/10/2026 jaisi dates ke liye)
  chartRanges: [
    { id: '4',   label: '4 hafte',  weeks: 4 },
    { id: '12',  label: '12 hafte', weeks: 12 },
    { id: 'all', label: 'Sab',      weeks: 0 }
  ],
  defaultRange: '12',
  sparkWeeks: 12,
  installHintDays: 14,     // iPhone hint dismiss karne ke baad kitne din na dikhayen
  cache: { key: 'chaajao_cache_v3' },
  oldCacheKeys: ['chaajao_cache_v2']
};
if (typeof self !== 'undefined') self.CONFIG = CONFIG;
if (typeof module !== 'undefined') module.exports = CONFIG;
