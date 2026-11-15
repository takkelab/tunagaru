// 録画してよいホストの許可リスト（ADR 0019）。tools/cassette と fixture-provenance で共有する
export const ALLOWED_HOSTS = [
  /(^|\.)wikipedia\.org$/,
  /^(www|query)\.wikidata\.org$/,
  /^musicbrainz\.org$/,
  /^api\.anthropic\.com$/,
];

/** synthetic（自分で書いた架空のデータ）の cassette だけが使える、予約済みの架空ドメイン */
export const SYNTHETIC_HOSTS = [/^example\.(com|org|net)$/, /\.example$/, /\.test$/, /\.invalid$/];
