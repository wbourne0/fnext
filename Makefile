

PATH=$(shell echo -n "$$PATH:$(shell pwd)/node_modules/.bin")

FILES=$(shell find ./src -name '*.ts' -or -name '*.tsx' ! -name '*.d.ts')


build: $(FILES) ./script/build.ts

# -rm -r build

# esbuild \
# 	--platform=node \
# 	--format=cjs \
# 	--target=node16 \
# 	--outdir=build/cjs \
# 	--outbase=src/ \
# 	--define:__IS_ESM__=false \
# 	--define:__IS_DEV__=true \
# 	--sourcemap=both \
# 	$(FILES)

# esbuild \
# 	--platform=node \
# 	--format=esm \
# 	--target=node16 \
# 	--outdir=build/esm \
# 	--outbase=src/ \
# 	--out-extension:.js=.mjs \
# 	--define:__IS_ESM__=true \
# 	--define:__IS_DEV__=true \
# 	--sourcemap=both \
# 	$(FILES)


	esbuild --sourcemap=inline --format=cjs script/build.ts | DEV_BUILD=1 node --enable-source-maps -

run_test: