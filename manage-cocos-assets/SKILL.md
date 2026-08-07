---
name: manage-cocos-assets
description: 通过 Cocos Creator 3.8 AssetDB 查询、创建、导入、复制、移动、重命名、删除、刷新和重新导入项目资源，并检查资源元数据、依赖和引用者。适用于替代直接操作资源文件及 .meta 的编辑器在线资源管理。
---

# 管理 Cocos 资源

编辑器运行时始终使用 AssetDB。不要直接移动、重命名或生成 `.meta`。

## 查询

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request asset-db query-assets '[{"pattern":"db://assets/**","ccType":"cc.Prefab"}]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request asset-db query-asset-info '["db://assets/ui/example.prefab"]'
```

## 创建、导入和复制

导入前先用 `query-asset-info` 检查目标目录中的目标 URL。若同名资源已存在，先生成一个同目录下未占用的新名称（在扩展名前追加递增编号，如 `icon_1.png`），再执行导入；不要覆盖已有资源。只有用户明确要求更新现有资源时，才沿用已有 URL。

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request asset-db create-asset '["db://assets/data/example.txt","content"]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request asset-db import-asset '["D:/source/icon.png","db://assets/textures/icon.png"]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request asset-db copy-asset '["db://assets/ui/a.prefab","db://assets/ui/b.prefab"]'
```

## 移动、重命名和删除

移动和重命名都调用 `move-asset`，目标参数包含完整新 URL：

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request asset-db move-asset '["db://assets/ui/a.prefab","db://assets/prefabs/a.prefab"]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request asset-db delete-asset '["db://assets/unused.txt"]'
```

删除前调用 `query-asset-users`。创建、导入、复制或移动后执行：

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> --timeout 60000 wait idle
```

然后重新查询资源信息和 UUID；导入异常时调用 `reimport-asset`，不要自行修补 `.meta`。对文件夹执行移动或删除前，先查询其全部后代资源及引用者，避免只检查目录自身。

编辑器关闭时，现有 `import-cocos-assets`、`move-cocos-asset` 和 `rename-cocos-asset` 只能作为受限离线后备。
