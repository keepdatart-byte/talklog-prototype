"use client";

import { useEffect, useRef, useState } from "react";

type DrawingCanvasProps = {
  onSave: (dataUrl: string) => void;
};

type Point = {
  x: number;
  y: number;
};

export function DrawingCanvas({ onSave }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [mode, setMode] = useState<"draw" | "erase">("draw");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#f7f6ef";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function drawLine(from: Point, to: Point) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = mode === "draw" ? 5 : 18;
    context.strokeStyle = "#222222";
    context.globalCompositeOperation = mode === "draw" ? "source-over" : "destination-out";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    setHistory((current) => [...current.slice(-19), canvas.toDataURL("image/png")]);
    drawingRef.current = true;
    lastPointRef.current = getPoint(event);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastPointRef.current) return;
    const point = getPoint(event);
    drawLine(lastPointRef.current, point);
    lastPointRef.current = point;
  }

  function stopDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.releasePointerCapture(event.pointerId);
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    setHistory((current) => [...current.slice(-19), canvas.toDataURL("image/png")]);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f7f6ef";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  function undo() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const previous = history.at(-1);
    if (!canvas || !context || !previous) return;

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
    };
    image.src = previous;
    setHistory((current) => current.slice(0, -1));
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/png"));
  }

  return (
    <div className="draw-panel">
      <canvas
        ref={canvasRef}
        width={320}
        height={260}
        className="drawing-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        aria-label="似顔絵を描くキャンバス"
      />
      <div className="tool-row">
        <button type="button" className={mode === "draw" ? "tool active" : "tool"} onClick={() => setMode("draw")}>
          PEN
        </button>
        <button type="button" className={mode === "erase" ? "tool active" : "tool"} onClick={() => setMode("erase")}>
          ERASE
        </button>
        <button type="button" className="tool" onClick={undo} disabled={history.length === 0}>
          UNDO
        </button>
        <button type="button" className="tool" onClick={clearCanvas}>
          CLEAR
        </button>
      </div>
      <button type="button" className="primary-button small" onClick={save}>
        保存
      </button>
    </div>
  );
}
