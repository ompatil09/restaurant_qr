import React, { useState } from "react";
import { Package } from "lucide-react";

interface LazyImageProps {
  src?: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  className = "",
  placeholderClassName = "",
}) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`bg-gray-100 flex items-center justify-center ${className} ${placeholderClassName}`}
        role="img"
        aria-label={`${alt} image unavailable`}
      >
        <Package className="w-8 h-8 text-gray-300" />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-gray-100 ${className}`}>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gray-100">
          <div className="h-full w-full bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover transition-opacity duration-200 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
};
