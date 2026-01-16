import { clsx } from "clsx";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

export const metadata: Metadata = {
    title: "Canon Weaver",
    description: "Interactive Storytelling Environment",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark h-full">
            <body className={clsx(inter.variable, "h-full w-full antialiased")}>
                {children}
                <Toaster richColors theme="dark" position="bottom-right" />
            </body>
        </html>
    );
}
