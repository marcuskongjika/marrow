# Linked Document

You arrived here from a relative link in [the kitchen sink](./kitchen-sink.md),
which means Marrow resolved `./linked.md` against the folder of the document you
were reading and opened it in a new tab instead of navigating the window.

## Why this matters

A viewer that follows relative links the way a static site would is the
difference between "a markdown previewer" and something you can actually read a
notes folder in. The resolution happens in the markdown pipeline, so it is unit
tested without launching Electron.

## Deep section

This heading exists so `./linked.md#deep-section` has somewhere to land. If you
followed the link with the fragment, the page should have scrolled here and the
heading should have flashed once.

### Even deeper

Three levels of heading are enough to show the outline's indentation.

## Back

- [Back to the kitchen sink](./kitchen-sink.md)
- [A link to a heading in this file](#why-this-matters)
