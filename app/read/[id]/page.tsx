import { ReaderScreen } from "@/components/reader/ReaderScreen";

export default async function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div id="main" className="h-dvh">
      <ReaderScreen id={id} />
    </div>
  );
}
