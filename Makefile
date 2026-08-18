# Fengya 铝门窗企业站 — 启动命令
# 用法: make <target>   例: make dev

.PHONY: help install dev build preview cms storage clean

help: ## 显示可用命令
	@echo "可用命令:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## 安装依赖
	npm install

dev: ## 启动完整开发环境（站点 + CMS 后台 + R2 本地存储）
	npm run dev:all

build: ## 生产构建
	npm run build

preview: ## 预览构建产物
	npm run preview

cms: ## 仅启动 Decap CMS 后台服务
	npm run cms

storage: ## 仅启动 R2 本地存储模拟
	npm run storage

clean: ## 清理构建产物与缓存
	rm -rf dist .astro
