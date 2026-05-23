import Image from 'next/image';

export function Logo() {
  return (
    <div className="flex flex-col gap-10 p-6 items-center">
      <div className="relative size-56 rounded-full bg-[#00573F]">
        <Image
          src="/dlsu-logo.png"
          alt="De La Salle University"
          layout="fill"
          objectFit="contain"
        />
      </div>
      <div className="text-white text-center">
        <h1 className="font-semibold uppercase text-2xl mb-2">
          De La Salle University
        </h1>
        <p className="opacity-[0.8]">Smart Entry & Exit Management</p>
      </div>
    </div>
  );
}
