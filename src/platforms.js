/**
 * AI platform definitions with detection URLs and region rules.
 * Region rules use ISO 3166-1 alpha-2 country codes.
 */

const OPENAI_SUPPORTED = new Set([
  'AL', 'DZ', 'AD', 'AO', 'AG', 'AR', 'AM', 'AU', 'AT', 'AZ', 'BS', 'BD', 'BB', 'BE', 'BZ', 'BJ', 'BT', 'BO', 'BA', 'BW', 'BR', 'BN', 'BG', 'BF', 'CV', 'CA', 'CL', 'CO', 'KM', 'CG', 'CR', 'CI', 'HR', 'CY', 'CZ', 'DK', 'DJ', 'DM', 'DO', 'EC', 'SV', 'EE', 'FJ', 'FI', 'FR', 'GA', 'GM', 'GE', 'DE', 'GH', 'GR', 'GD', 'GT', 'GN', 'GW', 'GY', 'HT', 'VA', 'HN', 'HU', 'IS', 'IN', 'ID', 'IQ', 'IE', 'IL', 'IT', 'JM', 'JP', 'JO', 'KZ', 'KE', 'KI', 'KW', 'KG', 'LV', 'LB', 'LS', 'LR', 'LI', 'LT', 'LU', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MR', 'MU', 'MX', 'FM', 'MD', 'MC', 'MN', 'ME', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NZ', 'NI', 'NE', 'NG', 'MK', 'NO', 'OM', 'PK', 'PW', 'PS', 'PA', 'PG', 'PY', 'PE', 'PH', 'PL', 'PT', 'QA', 'RW', 'KN', 'LC', 'VC', 'WS', 'SM', 'ST', 'SN', 'RS', 'SC', 'SL', 'SG', 'SK', 'SI', 'SB', 'ZA', 'KR', 'ES', 'LK', 'SR', 'SE', 'CH', 'TW', 'TZ', 'TH', 'TL', 'TG', 'TO', 'TT', 'TN', 'TR', 'TV', 'UG', 'UA', 'AE', 'GB', 'US', 'UY', 'VU', 'ZM', 'XX', 'T1'
]);

const ANTHROPIC_BLOCKED = new Set(['CN', 'HK', 'MO']);

const REGION_SETS = {
  openai: OPENAI_SUPPORTED,
};

const GOOGLE_BLOCKED = ['CN', 'IR', 'KP', 'SY', 'CU'];
const US_SANCTIONS = ['CN', 'RU', 'IR', 'KP', 'CU'];
const US_SANCTIONS_BY = ['CN', 'RU', 'IR', 'KP', 'CU', 'BY'];
const COPILOT_BLOCKED = ['CN', 'RU', 'BY', 'KP', 'IR', 'CU'];
const CHARACTER_BLOCKED = ['CN', 'RU', 'CU', 'IR', 'KP'];
const CURSOR_BLOCKED = ['CN', 'IR', 'KP', 'CU'];

function regionCheckFromRule(rule) {
  if (!rule || rule.type === 'always') return () => true;
  if (rule.type === 'allowlist') {
    const set = rule.set ? REGION_SETS[rule.set] : new Set(rule.codes || []);
    return (cc) => set.has(cc);
  }
  if (rule.type === 'blocklist') {
    const list = rule.codes || [];
    return (cc) => !list.includes(cc);
  }
  return () => true;
}

function serializeRegionRule(rule) {
  if (!rule || rule.type === 'always') return { type: 'always' };
  if (rule.type === 'allowlist' && rule.set) {
    return { type: 'allowlist', codes: [...REGION_SETS[rule.set]] };
  }
  if (rule.type === 'blocklist') {
    return { type: 'blocklist', codes: [...(rule.codes || [])] };
  }
  if (rule.type === 'allowlist') {
    return { type: 'allowlist', codes: [...(rule.codes || [])] };
  }
  return { type: 'always' };
}

const PLATFORMS = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    icon: '🤖',
    url: 'https://chatgpt.com',
    checkUrl: 'https://chatgpt.com/cdn-cgi/trace',
    regionRule: { type: 'allowlist', set: 'openai' },
  },
  {
    id: 'claude',
    name: 'Claude',
    icon: '🟠',
    url: 'https://claude.ai',
    checkUrl: 'https://claude.ai',
    regionRule: { type: 'blocklist', codes: [...ANTHROPIC_BLOCKED] },
  },
  {
    id: 'gemini',
    name: 'Gemini',
    icon: '✨',
    url: 'https://gemini.google.com',
    checkUrl: 'https://gemini.google.com',
    regionRule: { type: 'blocklist', codes: GOOGLE_BLOCKED },
  },
  {
    id: 'google-aimode',
    name: 'Google AI Mode',
    icon: '🧠',
    url: 'https://www.google.com/aimode',
    checkUrl: 'https://www.google.com/aimode',
    regionRule: { type: 'blocklist', codes: GOOGLE_BLOCKED },
  },
  {
    id: 'copilot',
    name: 'Copilot',
    icon: '🔵',
    url: 'https://copilot.microsoft.com',
    checkUrl: 'https://copilot.microsoft.com',
    regionRule: { type: 'blocklist', codes: COPILOT_BLOCKED },
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    icon: '🔍',
    url: 'https://www.perplexity.ai',
    checkUrl: 'https://www.perplexity.ai',
    regionRule: { type: 'blocklist', codes: US_SANCTIONS },
  },
  {
    id: 'grok',
    name: 'Grok',
    icon: '⚡',
    url: 'https://grok.com',
    checkUrl: 'https://grok.com',
    regionRule: { type: 'blocklist', codes: US_SANCTIONS_BY },
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    icon: '🌬️',
    url: 'https://chat.mistral.ai',
    checkUrl: 'https://chat.mistral.ai',
    regionRule: { type: 'always' },
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '🐋',
    url: 'https://chat.deepseek.com',
    checkUrl: 'https://chat.deepseek.com',
    regionRule: { type: 'always' },
  },
  {
    id: 'poe',
    name: 'Poe',
    icon: '📝',
    url: 'https://poe.com',
    checkUrl: 'https://poe.com',
    regionRule: { type: 'allowlist', set: 'openai' },
  },
  {
    id: 'character',
    name: 'Character.AI',
    icon: '🎭',
    url: 'https://character.ai',
    checkUrl: 'https://character.ai',
    regionRule: { type: 'blocklist', codes: CHARACTER_BLOCKED },
  },
  {
    id: 'huggingface',
    name: 'HuggingChat',
    icon: '🤗',
    url: 'https://huggingface.co',
    checkUrl: 'https://huggingface.co',
    regionRule: { type: 'always' },
  },
  {
    id: 'cohere',
    name: 'Cohere',
    icon: '🔗',
    url: 'https://cohere.com',
    checkUrl: 'https://cohere.com',
    regionRule: { type: 'always' },
  },
  {
    id: 'meta',
    name: 'Meta AI',
    icon: '🦙',
    url: 'https://www.meta.ai',
    checkUrl: 'https://www.meta.ai',
    regionRule: { type: 'blocklist', codes: US_SANCTIONS },
  },
  {
    id: 'pi',
    name: 'Pi',
    icon: '🥧',
    url: 'https://pi.ai',
    checkUrl: 'https://pi.ai',
    regionRule: { type: 'blocklist', codes: US_SANCTIONS },
  },
  {
    id: 'you',
    name: 'You.com',
    icon: '🎯',
    url: 'https://you.com',
    checkUrl: 'https://you.com',
    regionRule: { type: 'blocklist', codes: US_SANCTIONS },
  },
  {
    id: 'phind',
    name: 'Phind',
    icon: '💻',
    url: 'https://phind.com',
    checkUrl: 'https://phind.com',
    regionRule: { type: 'always' },
  },
  {
    id: 'replicate',
    name: 'Replicate',
    icon: '🔁',
    url: 'https://replicate.com',
    checkUrl: 'https://replicate.com',
    regionRule: { type: 'always' },
  },
  {
    id: 'together',
    name: 'Together AI',
    icon: '🤝',
    url: 'https://www.together.ai',
    checkUrl: 'https://www.together.ai',
    regionRule: { type: 'always' },
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: '🛣️',
    url: 'https://openrouter.ai',
    checkUrl: 'https://openrouter.ai',
    regionRule: { type: 'always' },
  },
  {
    id: 'stability',
    name: 'Stability AI',
    icon: '🎨',
    url: 'https://stability.ai',
    checkUrl: 'https://stability.ai',
    regionRule: { type: 'always' },
  },
  {
    id: 'kimi',
    name: 'Kimi',
    icon: '🌙',
    url: 'https://www.kimi.com',
    checkUrl: 'https://www.kimi.com',
    regionRule: { type: 'always' },
  },
  {
    id: 'qwen',
    name: 'Qwen Chat',
    icon: '🐱',
    url: 'https://chat.qwen.ai',
    checkUrl: 'https://chat.qwen.ai',
    regionRule: { type: 'always' },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    icon: '🖱️',
    url: 'https://cursor.com',
    checkUrl: 'https://cursor.com',
    regionRule: { type: 'blocklist', codes: CURSOR_BLOCKED },
  },
  {
    id: 'midjourney',
    name: 'Midjourney',
    icon: '🖼️',
    url: 'https://www.midjourney.com/home',
    checkUrl: 'https://www.midjourney.com/home',
    regionRule: { type: 'blocklist', codes: US_SANCTIONS },
  },
  {
    id: 'aistudio',
    name: 'Google AI Studio',
    icon: '🧪',
    url: 'https://aistudio.google.com',
    checkUrl: 'https://aistudio.google.com',
    regionRule: { type: 'blocklist', codes: GOOGLE_BLOCKED },
  },
  {
    id: 'notebooklm',
    name: 'NotebookLM',
    icon: '📓',
    url: 'https://notebooklm.google.com',
    checkUrl: 'https://notebooklm.google.com',
    regionRule: { type: 'blocklist', codes: GOOGLE_BLOCKED },
  },
  {
    id: 'groq',
    name: 'Groq',
    icon: '⚙️',
    url: 'https://groq.com',
    checkUrl: 'https://groq.com',
    regionRule: { type: 'always' },
  },
  {
    id: 'runway',
    name: 'Runway',
    icon: '🎬',
    url: 'https://runwayml.com',
    checkUrl: 'https://runwayml.com',
    regionRule: { type: 'blocklist', codes: US_SANCTIONS },
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    icon: '🎙️',
    url: 'https://elevenlabs.io',
    checkUrl: 'https://elevenlabs.io',
    regionRule: { type: 'always' },
  },
];

for (const platform of PLATFORMS) {
  platform.regionCheck = regionCheckFromRule(platform.regionRule);
}

module.exports = { PLATFORMS, OPENAI_SUPPORTED, REGION_SETS, serializeRegionRule };
