const title = 'KQM Sim — Shared simulation';
const description = 'Open this Genshin Impact simulation and explore team damage, rotations, and results.';
const imageAlt = 'KQM Sim — Every rotation. Every result.';

export async function handleInjectHead(request): Promise<Response> {
  const res = await ASSETS.fetch(request);
  const image = 'https://sim.kqm.gg/og/share.png';
  const content = (value: string) => ({element: (element: Element) => { element.setAttribute('content', value); }});
  return new HTMLRewriter()
    .on('title', {element: (element) => { element.setInnerContent(title); }})
    .on('meta[property="og:title"], meta[name="twitter:title"]', content(title))
    .on('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]', content(description))
    .on('meta[property="og:image"], meta[name="twitter:image"]', content(image))
    .on('meta[property="og:image:alt"], meta[name="twitter:image:alt"]', content(imageAlt))
    .transform(res);
}

export const handleInjectHeadDB = handleInjectHead;
