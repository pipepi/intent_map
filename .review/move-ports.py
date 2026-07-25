from pathlib import Path

p = Path("app/runtime/node-renderer.tsx")
text = p.read_text(encoding="utf-8")

# 1. 切出 ports 块
start_marker = "          {rows > 0 && ("
start = text.index(start_marker)
end_marker = "          )}"
end = text.index(end_marker, start) + len(end_marker)
block = text[start:end]
# 连同后续空行一起移除
removal = block
if text[end:end + 4] in ("\r\n\r\n", "\n\n"):
    removal = text[start:end + (4 if text[end:end+4] == "\r\n\r\n" else 2)]
elif text[end:end + 2] in ("\r\n", "\n"):
    removal = text[start:end + 2]
text = text.replace(removal, "", 1)

# 2. 块内调整：top 相对 strip（原 54 = 38 标题栏 + 16），并给 strip 一个高度
block = block.replace("54 + index * 26", "16 + index * 26")
block = block.replace(
    '<div className="runtime-node-ports" aria-hidden="true">',
    '<div\n                className="runtime-node-ports"\n                aria-hidden="true"\n                style={{ height: rows * 26 + 16 }}\n              >',
)
assert "54 + index * 26" not in block

# 3. 插入到 runtime-node-titlebar 的 </header> 之后
tb = text.index('className="runtime-node-titlebar"')
he = text.index("</header>", tb) + len("</header>")
# 移到该行行尾
nl = text.index("\n", he) + 1
insert = "\n" + block + "\n"
text = text[:nl] + insert + text[nl:]

# 4. article 样式加 gridTemplateRows（有端口时三行：标题栏/端口区/主体）
h = text.index("        height: size.height,")
nl2 = text.index("\n", h) + 1
text = (text[:nl2]
        + '        gridTemplateRows: rows > 0 ? "38px auto minmax(0, 1fr)" : undefined,\n'
        + text[nl2:])

p.write_text(text, encoding="utf-8")
print("OK")
