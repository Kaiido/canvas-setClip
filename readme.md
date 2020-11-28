# setClip.js

A `CanvasRenderingContext2D.setClip()` and `CanvasRenderingContext2D.resetClip()` polyfill.  

These methods are not *yet* part of the specs, but a long-dated request by web-devs [1][1], [2][2]
which faced implementers' disapproval because they were supposedly impossible to implement.  

This polyfill proves it's possible to have such methods, albeit through quite dirty
overrides.

### Additions to the CanvasDrawPath interface mixin:

```webidl
interface mixin CanvasDrawPath {
  undefined setClip(optional CanvasFillRule fillRule = "nonzero");
  undefined setClip(Path2D path, optional CanvasFillRule fillRule = "nonzero");
  undefined resetClip();
}
```

### Caveats
Because it overwrites all the drawing methods of the original context by using Path2D objects, this polyfill comes with a few caveats:

 - It requires **native support** for Path2D objects.
 - It may **not** be compatible with some drawing polyfills like `ellipse` or `roundRect`.
 - Drawing complex pathes when the context is transformed is slower when this polyfill is active.

For this last point, it is certainly best if you design your project to use only Path2D all along.

### Should I use this polyfill?

Your call. You can, but it comes with no warranty and is more a proof-of-concept than a real production ready code.

[1]: https://www.w3.org/Bugs/Public/show_bug.cgi?id=14499
[2]: https://whatwg.whatwg.narkive.com/v89Kf0y0/remove-resetclip-from-the-canvas-2d-spec#post11