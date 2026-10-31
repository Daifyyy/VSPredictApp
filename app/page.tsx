import { FixturePage } from './_components/FixturePage';
export const metadata = { title: 'Program a předzápasové predikce', description: 'Nadcházející fotbalové zápasy, uložené predikce a kvalifikované tipy.' };
export const dynamic = 'force-static';
export const revalidate = 300;
export default function Home() { return <FixturePage mode="program"/>; }
