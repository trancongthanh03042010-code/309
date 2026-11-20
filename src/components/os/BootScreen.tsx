import React from 'react';
import { motion } from 'motion/react';
import { useOS } from '../../context/OSContext';

export function BootScreen() {
  const { skipBoot } = useOS();

  return (
    <div className="absolute inset-0 z-50 bg-[#0D0D12] text-white flex flex-col items-center justify-between py-14 px-6 select-none">
      <div />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center text-center"
      >
        <div className="relative w-24 h-24 rounded-[28px] bg-gradient-to-br from-[#A78BFA] via-[#8B5CF6] to-[#F472B6] p-[2px] shadow-2xl shadow-purple-500/30 mb-6">
          <div className="w-full h-full rounded-[26px] bg-[#101016] flex items-center justify-center">
            <span className="font-display text-3xl font-extrabold tracking-tight bg-gradient-to-r from-[#C4B5FD] to-[#F9A8D4] bg-clip-text text-transparent">
              P·OS
            </span>
          </div>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2.2, ease: 'linear' }}
            className="absolute -inset-2 rounded-[34px] border border-purple-400/30 border-t-pink-400/80 pointer-events-none"
          />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">PHONE OS 4.0</h1>
        <p className="text-xs tracking-[0.16em] uppercase text-zinc-400 mt-2">
          iOS-Style Experience · 43 Ứng dụng · Thế giới AI sống
        </p>
        <div className="w-40 h-1 rounded-full bg-zinc-800 overflow-hidden mt-8">
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '0%' }}
            transition={{ duration: 1.35, ease: [0.16, 1, 0.3, 1] }}
            className="h-full bg-gradient-to-r from-[#A78BFA] to-[#F472B6]"
          />
        </div>
      </motion.div>

      <button
        onClick={skipBoot}
        className="text-xs text-zinc-400 hover:text-white px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
      >
        Bỏ qua màn hình khởi động
      </button>
    </div>
  );
}
