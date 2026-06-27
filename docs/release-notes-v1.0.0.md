# DustySearch v1.0.0

DustySearch 是一个 Windows 本地资料搜索和记忆库软件，用来查本机文件名、常见文档正文、截图文字、导入过的网页和收藏资料。

## 这版有什么

- 搜本机文件名和文件正文。
- 支持 PDF、Word、Excel、CSV、TXT、Markdown 和记忆库内容。
- 把文件和网页导入个人记忆库。
- 用 OCR 识别截图和照片里的文字。
- 给收藏资料加分类、标签和备注。
- 打开文件前先看命中原因和内容预览。
- 查看资料体检、读取失败、备份和索引状态。
- 本地优先，数据默认保存在 `Documents\DustySearchData`。

## 安装

下载 `DustySearch-Windows-v1.0.0.zip`，解压到一个固定位置，例如桌面或下载文件夹。

然后打开解压出来的 `DustySearchApp` 文件夹，双击：

```text
Start-DustySearch.cmd
```

如果 Windows 弹出安全提醒，请确认文件来自本仓库后，再选择继续运行。

## 数据位置

用户数据保存在软件目录外：

```text
%USERPROFILE%\Documents\DustySearchData
```

## 自检

本版本发布前已在本机通过内置自检。
