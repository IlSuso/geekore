import "./globals.css";
import NewsSync from "@/components/NewsSync";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body className="bg-[#050507] text-white">
        <NewsSync />
        {children}
      </body>
    </html>
  );
}