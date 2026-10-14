# Failure Modes

This fixture checks that the things which _can_ go wrong in a document degrade
gracefully: the page keeps rendering, and the problem is reported where it
happened rather than swallowed or escalated into a blank screen.

## An unparseable diagram

The block below is not valid Mermaid. It should become an inline error box that
shows the parser's complaint and the original source.

```mermaid
flowchart TD
    A[Start] -->
    --> ???  not valid mermaid at all
    B{{{
```

## A missing image

The file below does not exist. The custom protocol answers 404 and the browser
falls back to the alt text.

![This image is missing on purpose](./assets/nope.png)

## An image outside the opened folder

Marrow only serves assets from folders the user has opened. This absolute path
points somewhere else entirely, so the protocol refuses it:

![Refused by the path check](/etc/hosts.png)

## Broken maths

An expression KaTeX cannot parse is reported inline, in red, without taking the
paragraph down with it: $\frac{1}{$ and then normal text resumes.

## After the failures

Everything below still renders, and this heading still appears in the outline.

| Still | Working |
| ----- | ------- |
| yes   | yes     |
