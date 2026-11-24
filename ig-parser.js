/**
 * Instagram official export JSON parser & transparent rule-based tagger.
 * Never guesses private relationships or personal interests;
 * tags are strictly derived from verifiable metadata (mutual status, follow timestamp, username tokens).
 */

import { extractJsonFilesFromZip } from './zip-reader.js';

export async function parseImportedFiles(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) {
    throw new Error('請選擇至少一個 Instagram 匯出的 ZIP 或 JSON 檔案。');
  }

  const jsonEntries = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      const extracted = await extractJsonFilesFromZip(file);
      jsonEntries.push(...extracted);
    } else if (lower.endsWith('.json')) {
      const text = await file.text();
      jsonEntries.push({ name: file.name, text });
    }
  }

  if (jsonEntries.length === 0) {
    throw new Error('找不到追蹤中（following）或粉絲（followers）的 JSON 檔案。請確認匯入的是 Instagram 官方下載的 JSON 格式資料。');
  }

  const followingMap = new Map();
  const followersMap = new Map();
  const sourceFiles = [];

  for (const entry of jsonEntries) {
    let parsed;
    try {
      parsed = JSON.parse(entry.text);
    } catch {
      continue;
    }

    const baseName = entry.name.split('/').pop().toLowerCase();
    const isFollowing =
      baseName.includes('following') && !baseName.includes('hashtag') && !baseName.includes('request');
    const isFollowers =
      baseName.includes('follower') && !baseName.includes('request');

    if (isFollowing || (parsed && Array.isArray(parsed.relationships_following))) {
      const records = extractRecords(parsed, 'relationships_following');
      for (const rec of records) {
        if (!followingMap.has(rec.username)) {
          followingMap.set(rec.username, rec);
        }
      }
      sourceFiles.push({ name: entry.name, type: 'following', count: records.length });
    } else if (isFollowers || (parsed && Array.isArray(parsed.relationships_followers))) {
      const records = extractRecords(parsed, 'relationships_followers');
      for (const rec of records) {
        if (!followersMap.has(rec.username)) {
          followersMap.set(rec.username, rec);
        }
      }
      sourceFiles.push({ name: entry.name, type: 'followers', count: records.length });
    }
  }

  if (followingMap.size === 0) {
    throw new Error('已讀取檔案，但找不到「追蹤中（following）」名單。請確認包含 following.json。');
  }

  const accounts = [];
  for (const [username, rec] of followingMap.entries()) {
    const followerRec = followersMap.get(username);
    const isMutual = Boolean(followerRec);
    const followedAt = rec.timestamp ? rec.timestamp * 1000 : null;
    const hints = computeVerifiableHints(username, followedAt, isMutual);

    accounts.push({
      username,
      href: rec.href || `https://www.instagram.com/${encodeURIComponent(username)}/`,
      followedAt,
      followedBackAt: followerRec?.timestamp ? followerRec.timestamp * 1000 : null,
      isMutual,
      decision: 'undecided', // undecided | keep | mute | unfollow | later
      note: '',
      hints,
      raw: rec.raw,
      updatedAt: null
    });
  }

  // Sort default: oldest followed first (easier to spot forgotten accounts)
  accounts.sort((a, b) => (a.followedAt || 0) - (b.followedAt || 0));

  return {
    accounts,
    meta: {
      importedAt: Date.now(),
      followingCount: followingMap.size,
      followersCount: followersMap.size,
      mutualCount: accounts.filter((a) => a.isMutual).length,
      sourceFiles
    }
  };
}

function extractRecords(data, preferredKey) {
  let list = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data[preferredKey])) {
      list = data[preferredKey];
    } else {
      // Fallback: find first array property
      for (const val of Object.values(data)) {
        if (Array.isArray(val)) {
          list = val;
          break;
        }
      }
    }
  }

  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const sld = Array.isArray(item.string_list_data) ? item.string_list_data[0] : null;
    const rawUsername = (sld?.value || item.title || '').trim();
    if (!rawUsername) continue;

    const username = rawUsername.replace(/^@/, '');
    const href = `https://www.instagram.com/${encodeURIComponent(username)}/`;
    const timestamp = typeof sld?.timestamp === 'number' ? sld.timestamp : null;

    out.push({
      username,
      href,
      timestamp,
      raw: item
    });
  }
  return out;
}

/**
 * Strictly verifiable hints from username tokens & timestamp only.
 */
export function computeVerifiableHints(username, followedAt, isMutual) {
  const hints = [];
  const lower = username.toLowerCase();

  if (isMutual) {
    hints.push('互追');
  } else {
    hints.push('單方面追蹤');
  }

  if (followedAt) {
    const yearsAgo = (Date.now() - followedAt) / (1000 * 60 * 60 * 24 * 365);
    if (yearsAgo >= 3) hints.push('追蹤 3 年以上');
    else if (yearsAgo <= 0.5) hints.push('近半年追蹤');
  }

  // Strictly lexical username pattern hints (labeled as "名稱含...")
  const rules = [
    { re: /(official|brand|store|shop|mall|taiwan|tw_?official)/i, label: '名稱含品牌/官方字樣' },
    { re: /(news|daily|media|press|magazine|info)/i, label: '名稱含資訊/媒體字樣' },
    { re: /(invest|stock|finance|crypto|etf|money|wealth)/i, label: '名稱含投資/理財字樣' },
    { re: /(tech|dev|code|ai_|_ai|gadget|apple|android)/i, label: '名稱含科技字樣' },
    { re: /(game|gaming|esport|play|twitch|vtuber)/i, label: '名稱含遊戲字樣' },
    { re: /(deal|coupon|sale|discount|promo|freebie)/i, label: '名稱含優惠字樣' }
  ];

  for (const rule of rules) {
    if (rule.re.test(lower)) {
      hints.push(rule.label);
    }
  }

  return hints;
}
