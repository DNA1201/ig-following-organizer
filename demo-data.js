/**
 * Built-in desensitized demo dataset so users can test every feature immediately
 * before downloading their own Instagram official export.
 */

import { computeVerifiableHints } from './ig-parser.js';

export function buildDemoWorkspace() {
  const nowSec = Math.floor(Date.now() / 1000);
  const year = 365 * 24 * 3600;

  const samples = [
    { u: 'lin_yu_chen92', mutual: true, ageYears: 4.5 },
    { u: 'kevin_wu_taipei', mutual: true, ageYears: 3.8 },
    { u: 'may_chen_photo', mutual: true, ageYears: 2.2 },
    { u: 'jason_hoops23', mutual: true, ageYears: 5.1 },
    { u: 'tw_etf_invest_daily', mutual: false, ageYears: 1.4 },
    { u: 'ai_tech_weekly', mutual: false, ageYears: 0.4 },
    { u: 'gaming_esport_tw', mutual: false, ageYears: 2.8 },
    { u: 'nike_taiwan_official', mutual: false, ageYears: 4.2 },
    { u: 'deal_hunter_tw', mutual: false, ageYears: 0.3 },
    { u: 'old_promo_shop_2021', mutual: false, ageYears: 4.9 },
    { u: 'minimal_desk_studio', mutual: false, ageYears: 1.1 },
    { u: 'crypto_alpha_news', mutual: false, ageYears: 3.4 },
    { u: 'indie_game_devlog', mutual: false, ageYears: 0.8 },
    { u: 'coffee_roaster_lab', mutual: true, ageYears: 1.9 },
    { u: 'flash_sale_coupon_tw', mutual: false, ageYears: 3.6 },
    { u: 'apple_gadget_tips', mutual: false, ageYears: 2.1 },
    { u: 'jay_concert_official', mutual: false, ageYears: 5.4 },
    { u: 'weekend_hiker_club', mutual: true, ageYears: 0.9 },
    { u: 'random_giveaway_2022', mutual: false, ageYears: 3.9 },
    { u: 'stock_value_notes', mutual: false, ageYears: 1.6 }
  ];

  const accounts = samples.map((s) => {
    const ts = Math.floor(nowSec - s.ageYears * year);
    const followedAt = ts * 1000;
    return {
      username: s.u,
      href: `https://www.instagram.com/${s.u}/`,
      followedAt,
      followedBackAt: s.mutual ? followedAt + 86400000 : null,
      isMutual: s.mutual,
      decision: 'undecided',
      note: '',
      hints: computeVerifiableHints(s.u, followedAt, s.mutual),
      raw: { string_list_data: [{ href: `https://www.instagram.com/${s.u}/`, value: s.u, timestamp: ts }] },
      updatedAt: null
    };
  });

  accounts.sort((a, b) => (a.followedAt || 0) - (b.followedAt || 0));

  return {
    accounts,
    meta: {
      importedAt: Date.now(),
      followingCount: accounts.length,
      followersCount: accounts.filter((a) => a.isMutual).length,
      mutualCount: accounts.filter((a) => a.isMutual).length,
      sourceFiles: [{ name: '內建示範資料（非真實帳號）', type: 'demo', count: accounts.length }],
      isDemo: true
    },
    settings: {
      protectMutual: true,
      autoOpenNext: false
    }
  };
}
