package main

import (
	"fmt"
	"io/fs"
	"io/ioutil"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"

	esbuild "github.com/evanw/esbuild/pkg/api"
)

var babelStrings = []string{"style jsx", "css=", ""}

// TODO: assign each file a unique ID and use that for imports and such.

var rootDir string
var pagesDir string

func init() {
	if len(os.Args) != 2 {
		// fmt.Println("expected 2 args")
		os.Exit(1)
	}

	if os.Args[1][0] == '/' {
		rootDir = os.Args[1]
	} else {
		wd, err := os.Getwd()
		chk(err)
		rootDir = filepath.Join(wd, os.Args[1])
	}

	pagesDir = filepath.Join(rootDir, "pages")
	logOut, _ := os.Create("./esbuild.log")

	log.SetOutput(logOut)
	log.SetFlags(log.Flags() | log.Lmicroseconds)
}

func build(opts esbuild.BuildOptions) string {
	file, err := os.CreateTemp("/tmp", "esbuild_out_*")
	chk(err)
	defer file.Close()

	opts.Outfile = file.Name()

	esbuild.Build(opts)
	// fmt.Println(result, opts.en)

	buf, err := ioutil.ReadAll(file)
	// fmt.Println(file.Name())

	chk(err)
	return string(buf)
}

var (
	importers         = map[string][]string{}
	importersLock     sync.Mutex
	importersWg       sync.WaitGroup
	babelCompiled     = map[string]string{}
	babelCompiledLock sync.Mutex

	compileableRegex = regexp.MustCompile("\\.[tj]sx?$")
	aliasRegex       = regexp.MustCompile("^(app|pages|generated-gql|typings)/")
	needsBabelRegex  = regexp.MustCompile("style( global)? jsx|global`|resolve`|css=")

	virtualID uint64 = 1
)

const virtualDir = "/__virtual__/"

func getSetup(head string) func(pb esbuild.PluginBuild) {
	return func(pb esbuild.PluginBuild) {
		pb.OnResolve(esbuild.OnResolveOptions{Filter: "^" + pagesDir}, func(args esbuild.OnResolveArgs) (esbuild.OnResolveResult, error) {
			if filepath.Dir(args.Path) == pagesDir {
				if base := filepath.Base(args.Path); base[:len(base)-len(filepath.Ext(base))] == "_document" {
					return esbuild.OnResolveResult{Path: args.Path}, nil
				}
			}
			return esbuild.OnResolveResult{
				Path:      args.Path,
				Namespace: "pages",
			}, nil
		})

		pb.OnLoad(esbuild.OnLoadOptions{Namespace: "pages", Filter: ".*"}, func(args esbuild.OnLoadArgs) (esbuild.OnLoadResult, error) {
			content := head +
				virtualDir + strconv.FormatUint(atomic.AddUint64(&virtualID, 1), 36) + "'"

			return esbuild.OnLoadResult{
				Contents:   &content,
				PluginData: args.Suffix,
			}, nil
		})

		pb.OnResolve(esbuild.OnResolveOptions{Filter: "^" + virtualDir}, func(args esbuild.OnResolveArgs) (esbuild.OnResolveResult, error) {

			fmt.Printf("r:%s\n", args.Importer)
			return esbuild.OnResolveResult{
				Path:   args.Importer,
				Suffix: args.PluginData.(string),
				// Namespace: "page_load",
			}, nil
		})

		// pb.OnResolve(esbuild.OnResolveOptions{})

	}
}

func main() {

	entryPoints := []string{}
	var hasDocument bool
	// ssr := []string{}

	chk(filepath.Walk(pagesDir, func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			if filepath.Dir(path) == pagesDir && strings.HasPrefix(info.Name(), "_document.") {
				hasDocument = true
			} else {
				entryPoints = append(entryPoints, path)
				// sr = append(special)
			}
		}

		return nil
	}))

	fmt.Println("compiling", entryPoints)
	outdir := filepath.Join(rootDir, "dist")
	// os.RemoveAll(outdir)

	// result := esbuild.Build(esbuild.BuildOptions{
	// 	Sourcemap:      esbuild.SourceMapInline,
	// 	SourcesContent: esbuild.SourcesContentInclude,
	// 	// Engines:             []esbuild.Engine{},
	// 	// MinifyWhitespace:  true,
	// 	// MinifyIdentifiers: true,
	// 	// MinifySyntax:      true,
	// 	TreeShaking:       esbuild.TreeShakingTrue,
	// 	IgnoreAnnotations: false,
	// 	JSXMode:           esbuild.JSXModeTransform,
	// 	// GlobalName:        "",
	// 	Bundle:     true,
	// 	Splitting:  true,
	// 	Metafile:   true,
	// 	Outdir:     outdir,
	// 	Format:     esbuild.FormatESModule,
	// 	EntryNames: "static/pages/[hash]",
	// 	ChunkNames: "static/chunks/[hash]",

	// 	EntryPoints:         entryPoints,
	// 	EntryPointsAdvanced: []esbuild.EntryPoint{},
	// 	Write:               true,
	// 	Plugins: []esbuild.Plugin{
	// 		{
	// 			Name:  "default picker",
	// 			Setup: getSetup("export { default } from '"),
	// 		},
	// 		// {
	// 		// 	Name: "Heh",
	// 		// 	Setup: func(pb esbuild.PluginBuild) {
	// 		// 		// pb.OnLoad(esbuild.OnLoadOptions{Filter: "^" + rootDir}, func(args esbuild.OnLoadArgs) (esbuild.OnLoadResult, error) {
	// 		// 		// 	src, err := ioutil.ReadFile(args.Path)

	// 		// 		// 	if err != nil {
	// 		// 		// 		return esbuild.OnLoadResult{}, err
	// 		// 		// 	}

	// 		// 		// 	str := string(src) + ";"
	// 		// 		// })

	// 		// 		// pb.OnResolve(esbuild.OnResolveOptions{}, func(args esbuild.OnResolveArgs) (esbuild.OnResolveResult, error) {

	// 		// 		// })
	// 		// 	},
	// 		// },
	// 	},
	// 	// Watch: &esbuild.WatchMode{
	// 	// 	OnRebuild: func(result esbuild.BuildResult) {
	// 	// 		if len(result.Errors) > 0 {
	// 	// 			for _, err := range result.Errors {
	// 	// 				fmt.Println(err)
	// 	// 			}
	// 	// 		}

	// 	// 		for _, warn := range result.Warnings {
	// 	// 			fmt.Println(warn)
	// 	// 		}

	// 	// 		ioutil.WriteFile(filepath.Join(rootDir, "meta.json"), []byte(result.Metafile), 0644)
	// 	// 	},
	// 	// },
	// })

	// defer result.Stop()

	// if len(result.Errors) > 0 {
	// 	for _, err := range result.Errors {
	// 		fmt.Println(err)
	// 	}
	// }

	// for _, warn := range result.Warnings {
	// 	fmt.Println(warn)
	// }

	// ioutil.WriteFile(filepath.Join(rootDir, "meta.json"), []byte(result.Metafile), 0644)

	if hasDocument {
		entryPoints = append(entryPoints, filepath.Join(pagesDir, "_document.tsx"))
	}

	serverBuildResult := esbuild.Build(esbuild.BuildOptions{
		Sourcemap:         esbuild.SourceMapLinked,
		MinifyWhitespace:  true,
		MinifyIdentifiers: true,
		MinifySyntax:      true,
		Bundle:            true,
		Metafile:          true,
		Outdir:            filepath.Join(outdir, "ssr"),
		Format:            esbuild.FormatCommonJS,
		EntryNames:        "[dir]/[name]",
		// Target:            esbuild.Target(esbuild.EngineNode),
		Engines: []esbuild.Engine{{
			Name:    esbuild.EngineNode,
			Version: "14",
		}},
		// ChunkNames:          "[dir]/chunks/[hash]",
		EntryPoints: entryPoints,
		// EntryPointsAdvanced: []esbuild.EntryPoint{},

		Write: true,
		Plugins: []esbuild.Plugin{{
			Name:  "exporter",
			Setup: getSetup("export * from '"),
		}, {
			Name: "react remover",
			Setup: func(pb esbuild.PluginBuild) {
				pb.OnResolve(esbuild.OnResolveOptions{
					Filter:    ".*",
					Namespace: "file", // file is the default esbuild namespace
				}, func(args esbuild.OnResolveArgs) (esbuild.OnResolveResult, error) {
					result := pb.Resolve(args.Path, esbuild.ResolveOptions{
						Importer:   args.Importer,
						Namespace:  "other", // avoid using the `file` namespace due to recursion
						Kind:       esbuild.ResolveJSImportStatement,
						ResolveDir: args.ResolveDir,
					})

					// tell esbuild that none of the imports have side effects, this way it'll remove imports that are only used in the `default` export.
					return esbuild.OnResolveResult{Path: result.Path, SideEffects: esbuild.SideEffectsFalse, External: true}, nil
				})
			},
		}},
		// Watch: &esbuild.WatchMode{
		// 	OnRebuild: func(result esbuild.BuildResult) {
		// 		if len(result.Errors) > 0 {
		// 			for _, err := range result.Errors {
		// 				fmt.Println(err)
		// 			}
		// 		}

		// 		for _, warn := range result.Warnings {
		// 			fmt.Println(warn)
		// 		}
		// 	},
		// },
	})

	// defer serverBuildResult.Stop()

	if len(serverBuildResult.Errors) > 0 {
		for _, err := range serverBuildResult.Errors {
			fmt.Println(err)
		}
	}

	for _, warn := range serverBuildResult.Warnings {
		fmt.Println(warn)
	}

	// ioutil.WriteFile(filepath.Join(rootDir, "meta.json"), []byte(serverBuildResult.Metafile), 0644)

	done := make(chan os.Signal)
	signal.Notify(done, syscall.SIGINT, syscall.SIGTERM)

	// sig := <-done

	// fmt.Println("Killed with", sig.String())
}
func chk(err error) {
	if err != nil {
		panic(err)
	}
}
