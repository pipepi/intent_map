import type { Metadata } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://intent-map-fractal.bit23665.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Intent Map｜分形意图编辑器",
  description: "用递归模块、动态依赖图和本地运行追踪设计可组合的意图系统。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Intent Map｜分形意图编辑器",
    description: "用递归模块、动态依赖图和本地运行追踪设计可组合的意图系统。",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "Intent Map 分形意图编辑器",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Intent Map｜分形意图编辑器",
    description: "用递归模块、动态依赖图和本地运行追踪设计可组合的意图系统。",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
