import * as esbuild from 'esbuild'

const ctx = await esbuild.context({
  entryPoints: ['src/app.ts'],
  bundle: true,
  outfile: 'dist/app.js',
  format: 'iife',
  sourcemap: true,
})

console.log('Watching...')
await ctx.watch()
