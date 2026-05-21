async function gqlFetch(query, variables) {
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const visited = new Set();
const queue = [9756];
const results = [];

while (queue.length > 0) {
  const id = queue.shift();
  if (visited.has(id)) continue;
  if (visited.size >= 20) break;
  visited.add(id);

  const data = await gqlFetch(
    `query GetSeason($id: Int) {
      Media(id: $id, type: ANIME) {
        id title { romaji english } format seasonYear episodes
        relations { edges { relationType node { id format } } }
      }
    }`,
    { id }
  );

  const media = data?.data?.Media;
  console.log('Got:', id, media?.format, media?.title?.romaji ?? '—', '| errors:', JSON.stringify(data?.errors ?? null));
  if (!media) continue;

  if (media.format === 'TV' || media.format === 'TV_SHORT' || media.format === 'MOVIE') {
    results.push({ id: media.id, format: media.format, title: media.title?.romaji, episodes: media.episodes });
  }

  for (const edge of (media.relations?.edges ?? [])) {
    if ((edge.relationType === 'PREQUEL' || edge.relationType === 'SEQUEL') && !visited.has(edge.node.id)) {
      console.log('  queue:', edge.node.id, edge.node.format, '←', edge.relationType);
      queue.push(edge.node.id);
    }
  }

  await new Promise(r => setTimeout(r, 400));
}

console.log('\nFINAL RESULTS:');
results.forEach((r, i) => console.log(` ${i+1}. [${r.format}] ${r.title} (eps: ${r.episodes})`));
