import { useRef, type PointerEvent } from "react";

interface SignaturePadProps {
  label: string;
  clearLabel: string;
  onChange: (signature: string) => void;
}

export default function SignaturePad({ label, clearLabel, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * canvas.width / bounds.width,
      y: (event.clientY - bounds.top) * canvas.height / bounds.height,
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const position = point(event);
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !position) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(position.x, position.y);
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111";
    context.lineTo(position.x + 0.1, position.y + 0.1);
    context.stroke();
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const position = point(event);
    if (!context || !position) return;
    context.lineTo(position.x, position.y);
    context.stroke();
  }

  function finish() {
    if (!drawing.current) return;
    drawing.current = false;
    const signature = canvasRef.current?.toDataURL("image/png");
    if (signature) onChange(signature);
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div className="signature-field field-wide">
      <div className="signature-heading"><span>{label}</span><button type="button" className="text-button" onClick={clear}>{clearLabel}</button></div>
      <canvas
        ref={canvasRef}
        className="signature-canvas"
        width={720}
        height={180}
        aria-label={label}
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
    </div>
  );
}
