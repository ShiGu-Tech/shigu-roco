import { DataBrowser } from "@/modules/data-browser/data-browser";

export default function DataPage() {
  return (
    <main className="app-shell mx-auto min-h-screen max-w-[1280px] px-4 py-5 min-[520px]:px-6 min-[520px]:py-8">
      <DataBrowser />
    </main>
  );
}
