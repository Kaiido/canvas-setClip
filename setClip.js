;(function(){ "use strict";
  if( globalThis.CanvasRenderingContext2D && !globalThis.CanvasRenderingContext2D.setClip ) {

    const contexts = new WeakMap();
    const drawing_pathes = new WeakMap();
    const clipping_stacks = new WeakMap();
    const canvas_states = new WeakMap();

    const original_ctx_proto = globalThis.CanvasRenderingContext2D.prototype;

    const clonePath = ( path ) => {

      const clone = new Path2D();
      clone.addPath( path );
      return clone;

    };
    const transformPath = ( path, matrix ) => {

      const clone = new Path2D();
      clone.addPath( path, matrix );
      return clone;

    };
    const getInternalPathToDraw = ( ctx ) => {

      const path = drawing_pathes.get( ctx );
      const current_transform = ctx.getTransform();

      return current_transform.isIdentity ? path :
        transformPath( path, current_transform.inverse() );        

    }
    const canvasStateGetters = [
      "strokeStyle", "fillStyle", "globalAlpha", "lineWidth", "lineCap", "lineJoin", "miterLimit",
      "lineDashOffset", "shadowOffsetX", "shadowOffsetY", "shadowBlur", "shadowColor",
      "globalCompositeOperation", "font", "textAlign", "textBaseline", "direction",
      "imageSmoothingEnabled"
    ];
    const getCanvasState = ( ctx ) => {

      const state = {
        transform: ctx.getTransform(),
        lineDash: ctx.getLineDash(),
        clippingPathes: clipping_stacks.get( ctx ).slice()
      };
    
      canvasStateGetters.forEach( ( key ) => {
        const value = ctx[ key ];
        if( typeof value === "function" ) {
          return;
        }
        state[ key ] = value;
      } );

      return state;

    };
    const applyCanvasState = ( ctx, state ) => {

      // We are the only ones to have access to the original save and restore methods,
      // we can thus ensure that there is always only one state being really saved internally:
      // the default status with no clipping areas.
      // Other properties of the CanvasState will be overridden anyway.
      original_ctx_proto.restore.call( ctx ); // restore defaults
      original_ctx_proto.save.call( ctx ); // save defaults

      canvasStateGetters.forEach( (key) => { ctx[ key ] = state[ key ]; } );
      ctx.setTransform( state.transform );
      ctx.setLineDash( state.lineDash );
      state.clippingPathes.forEach( (clipping_path) => {
        original_ctx_proto.clip.call( ctx, clipping_path, clipping_path.fillRule );
      } );
      clipping_stacks.set( ctx, state.clippingPathes );

    };
    
    const overrideMethodUsingPathWithFillRule = ( method_name ) => {

      return function( path, fill_rule = "nonzero", ...args ) {

        if( !(path instanceof Path2D) ) {
          fill_rule = path;
          path = getInternalPathToDraw( this );
        }
        return original_ctx_proto[ method_name ].apply( this, [ path, fill_rule, ...args ] );

      };

    };
    const overrideMethodUsingPath = ( method_name ) => {

      return function( path, ...args ) {

        if( !(path instanceof Path2D) ) {
          path = getInternalPathToDraw( this );
        }
        
        return original_ctx_proto[ method_name ].call( this, path, ...args );

      };

    };
    const overriders = {
      beginPath() {
    
        drawing_pathes.set( this, new Path2D() );
    
      },
      fill: overrideMethodUsingPathWithFillRule( "fill" ),
      stroke: overrideMethodUsingPath( "stroke" ),
      isPointInPath( path, x, y, fill_rule ) {

        if( !(path instanceof Path2D) ) {
          fill_rule = y;
          y = x;        
          x = path;
          path = getInternalPathToDraw( this );
        }
        return original_ctx_proto.isPointInPath.call( this, path, x, y, fill_rule );

      },
      isPointInStroke( path, x, y ) {

        if( !(path instanceof Path2D) ) {
          y = x;        
          x = path;
          path = getInternalPathToDraw( this );
        }
        return original_ctx_proto.isPointInStroke.call( this, path, x, y );
        
      },
      scrollPathIntoView: overrideMethodUsingPath( "scrollPathIntoView" ),
      
      save() {

        canvas_states.get( this ).push( getCanvasState( this ) );

      },
      restore() {

        const state = canvas_states.get( this ).pop();
        if( state ) {
          applyCanvasState( this, state );
        }
      
      },
      clip( path, fill_rule = "nonzero" ) {

        if( !(path instanceof Path2D) ) {
          fill_rule = path;
          path = getInternalPathToDraw( this );
        }

        const clipping_path = clonePath( path );
        clipping_path.fillRule = fill_rule;
      
        const clipping_pathes = clipping_stacks.get( this );
        clipping_pathes.push( clipping_path );
      
        const current_state = getCanvasState( this );			
        applyCanvasState( this, current_state );

      },
      setClip( path, fill_rule = "nonzero" ) {

        if( !(path instanceof Path2D) ) {
          fill_rule = path;
          path = drawing_pathes.get( this );
        }

        const clipping_path = clonePath( path );
        clipping_path.fillRule = fill_rule;
      
        const clipping_pathes = clipping_stacks.get( this );
        clipping_pathes.length = 0;
        clipping_pathes.push( clipping_path );
      
        const current_state = getCanvasState( this );
        applyCanvasState( this, current_state );

      },
      resetClip() {
        clipping_stacks.get( this ).length = 0;
        const current_state = getCanvasState( this );
        applyCanvasState( this, current_state );
      }
    };

    const clearCanvasContext = ( canvas ) => {

      const ctx = contexts.get( canvas );
      if( ctx ) {
        drawing_pathes.set( ctx, new Path2D() );
        clipping_stacks.get( ctx ).length = 0;
      }
  
    };
    const canvas_proto = globalThis.HTMLCanvasElement.prototype;
    const originalGetContext = canvas_proto.getContext;
    const canvas_width_desc = Object.getOwnPropertyDescriptor( canvas_proto, "width" );
    const canvas_height_desc = Object.getOwnPropertyDescriptor( canvas_proto, "height" );

    // when the context has transformation applied, our general path drawer
    // becomes quite slow (many new objects created).
    // some methods are easy to rewrite in a more performant way
    // some are impossible (e.g arcTo).
    const CanvasPath_overriders = {
      moveTo( x, y ) {

        const drawing_path = drawing_pathes.get( this );
        const current_matrix = this.getTransform();
        const transformed_point = current_matrix.transformPoint( { x, y } );
        drawing_path.lineTo( transformed_point.x, transformed_point.y );

      },
      lineTo( x, y ) {

        const drawing_path = drawing_pathes.get( this );
        const current_matrix = this.getTransform();
        const transformed_point = current_matrix.transformPoint( { x, y } );
        drawing_path.lineTo( transformed_point.x, transformed_point.y );

      },
      rect( x, y, width, height ) {

        const drawing_path = drawing_pathes.get( this );
        const current_matrix = this.getTransform();
        
        const pt1 = current_matrix.transformPoint( { x, y } );
        const pt2 = current_matrix.transformPoint( { x: x + width, y } );
        const pt3 = current_matrix.transformPoint( { x: x + width, y: y + height } );
        const pt4 = current_matrix.transformPoint( { x, y: y + height } );

        drawing_path.moveTo( pt1.x, pt1.y );
        [ pt2, pt3, pt4, pt1 ].forEach( (pt) => drawing_path.lineTo( pt.x, pt.y ) );
        drawing_path.moveTo( pt1.x, pt1.y );

      }
    };

    canvas_proto.getContext = function getContext( ...args ) {
  
      if( contexts.has( this ) ) {
        return contexts.get( this );
      }
  
      const ctx = originalGetContext.apply( this, args );
      if( args[ 0 ] === "2d" ) {

        Object.assign( ctx, overriders );
        drawing_pathes.set( ctx, new Path2D() );
        clipping_stacks.set( ctx, [] );
        canvas_states.set( ctx, [] );

        Object.entries( Path2D.prototype ).forEach( ([ key, fn ]) => {
          if( !(key in original_ctx_proto) ) { // addPath() doesn't exist on 2DContext
            return;
          }
          ctx[ key ] = typeof fn === "function" ?
            (...args) => {
              // internal path's declaration should use the current transform
              const current_matrix = ctx.getTransform();

              // composing the path this way is *utterly* slow
              // so since it's needed only when there is a transform to apply
              // we exit early for identity matrix
              // using the fast built-in
              if( current_matrix.isIdentity ) {
                const drawing_path = drawing_pathes.get( ctx );
                return drawing_path[ key ]( ...args );
              }

              // if we were able to write a faster polyfill
              if( key in CanvasPath_overriders ) { 
                return CanvasPath_overriders[ key ].call( ctx, ...args );
              }

              // otherwise use the slow path compositor
              // apply the new drawing operation without the current transform
              const drawing_path = drawing_pathes.get( ctx );
              const new_path = new Path2D();
              new_path.addPath( drawing_path, current_matrix.inverse() );
              const return_value = new_path[ key ]( ...args );
              
              // reapply the current transform
              // needs to be a third Path2D instance to not duplicate previous segments
              const final_path = new Path2D();
              final_path.addPath( new_path, current_matrix );
              drawing_pathes.set( ctx, final_path );
              
              return return_value;

            } :
            fn;
         } );
        contexts.set( this, ctx );
      }
    
      return ctx;

    };
    Object.defineProperty( canvas_proto, "width", Object.assign( {}, canvas_width_desc, {
        set: function( value ) {
          clearCanvasContext( this );
          canvas_width_desc.set.call( this, value );
        }
      } )
    );
    Object.defineProperty( canvas_proto, "height", Object.assign( {}, canvas_height_desc, {
        set: function( value ) {
          clearCanvasContext( this );
          canvas_height_desc.set.call( this, value );
        }
      } )
    );

  }
})();