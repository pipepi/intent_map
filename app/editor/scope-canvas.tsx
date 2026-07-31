"use client";

/* eslint-disable react-hooks/refs -- DOM refs are forwarded as props and never dereferenced during render. */

import type { ComponentProps, RefObject } from "react";

import type { CameraState, ScopeAddress } from "../runtime/model";
import {
  AppScopeContent,
  ContainerResizeControls,
  ScopeHeader,
  ScopeNavigationBar,
} from "./canvas-layers";
import {
  BusinessScopeLayer,
  type BusinessScopeLayerDeps,
} from "./business-scope-layer";

type AppContentProps = ComponentProps<typeof AppScopeContent>;
type HeaderProps = ComponentProps<typeof ScopeHeader>;
type ResizeProps = ComponentProps<typeof ContainerResizeControls>;

export interface ScopeCanvasModel {
  camera: CameraState;
  renderedWorldSize: { width: number; height: number };
  activeCameraKey: string;
  scopeMinimized: boolean;
  isBusinessScope: boolean;
  layoutLocked: boolean;
  navigationStack: ScopeAddress[];
  scopePath: string[];
  derivedPipeCount: number;
  scopeLegendOpen: boolean;
  toast: string;
  businessLayer: BusinessScopeLayerDeps;
  appContent: AppContentProps;
  header: HeaderProps;
  resizeControls: ResizeProps;
}

export interface ScopeCanvasActions {
  onWheel: NonNullable<ComponentProps<"div">["onWheel"]>;
  onViewportPointerDown: NonNullable<ComponentProps<"div">["onPointerDown"]>;
  onToggleLegend: () => void;
  onNavigateParent: () => void;
  onNavigateFrame: (index: number) => void;
  onDismissToast: () => void;
}

export interface ScopeCanvasRefs {
  viewport: RefObject<HTMLDivElement | null>;
}

export interface ScopeCanvasProps {
  model: ScopeCanvasModel;
  actions: ScopeCanvasActions;
  refs: ScopeCanvasRefs;
}

export function ScopeCanvas({ model, actions, refs }: ScopeCanvasProps) {
  const {
    camera,
    renderedWorldSize,
    activeCameraKey,
    scopeMinimized,
    isBusinessScope,
    layoutLocked,
  } = model;

  return (
    <div
      ref={refs.viewport}
      className={`root-node-viewport ${layoutLocked ? "layout-locked" : ""}`}
      onWheel={actions.onWheel}
      onPointerDownCapture={(event) => {
        if (event.pointerType === "touch") actions.onViewportPointerDown(event);
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch") actions.onViewportPointerDown(event);
      }}
    >
      <div
        className="root-grid"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
          width: renderedWorldSize.width,
          height: renderedWorldSize.height,
        }}
      >
        <div
          key={activeCameraKey}
          className={`root-boundary scope-arrival ${scopeMinimized ? "minimized" : "expanded"} ${isBusinessScope ? "business-scope-root" : ""}`}
          style={{ width: renderedWorldSize.width, height: renderedWorldSize.height }}
          data-display-mode={scopeMinimized ? "minimized" : "expanded"}
        >
          {!scopeMinimized && model.navigationStack.length > 1 && (
            <ScopeNavigationBar
              scopePath={model.scopePath}
              navigationStack={model.navigationStack}
              pipeCount={model.derivedPipeCount}
              cameraScale={camera.scale}
              legendOpen={model.scopeLegendOpen}
              onToggleLegend={actions.onToggleLegend}
              onNavigateParent={actions.onNavigateParent}
              onNavigateFrame={actions.onNavigateFrame}
            />
          )}
          <ScopeHeader {...model.header} />
          {!scopeMinimized && isBusinessScope && (
            <BusinessScopeLayer {...model.businessLayer} />
          )}
          {!scopeMinimized && !isBusinessScope && (
            <AppScopeContent {...model.appContent} />
          )}
          {!scopeMinimized && !layoutLocked && (
            <ContainerResizeControls {...model.resizeControls} />
          )}
        </div>
      </div>
      {model.toast && (
        <button
          type="button"
          className="runtime-toast"
          aria-label={`关闭提示：${model.toast}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={actions.onDismissToast}
        >
          {model.toast}<span>×</span>
        </button>
      )}
    </div>
  );
}
