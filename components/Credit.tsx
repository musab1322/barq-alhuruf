export default function Credit({ dark }: { dark?: boolean }) {
  return (
    <footer className={`mt-8 pb-2 text-center text-sm ${dark ? "text-white/50" : "text-white/60"}`}>
      برمجة وتصميم الأستاذ <span className="font-bold text-white/80">مصعب العبدالعالي</span> · جميع الحقوق محفوظة © 2026
    </footer>
  );
}

