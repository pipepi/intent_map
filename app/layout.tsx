import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Intent Map｜分形意图编辑器",
  description: "用递归模块、动态依赖图和本地运行追踪设计可组合的意图系统。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
