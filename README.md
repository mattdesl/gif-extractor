# gif-extractor

Extract PNG frames from a set of GIF files, optionally upscaling them to a specific size (with nearest-neighbour scaling).

Online demo:
https://gif-extractor.netlify.app/

## Approach

This uses [gifuct-js](https://github.com/matt-way/gifuct-js) to extract frames, and coalesces them into a raw ArrayBuffer. This is then encoded with [fast-png](https://www.npmjs.com/package/fast-png), and then saved to a folder on disk using Chrome's File System API.

## Build & Run Locally

Clone, `cd` into this repo, then:

```sh
# install dependencies
npm install

# run local dev server
npm run dev

# or build website to disk
npm run build
```

## License

MIT, see [LICENSE.md](http://github.com/mattdesl/gif-extractor/blob/master/LICENSE.md) for details.
