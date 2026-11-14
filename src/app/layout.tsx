import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "SERVICE ELECTRIC | Facturare", description: "Facturare SERVICE ELECTRIC" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
 return <html lang="ro"><body>{children}</body></html>;
}