import { useEffect, useState, type ImgHTMLAttributes } from 'react'

type LoadingImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  frameClassName?: string
}

/** Images keep their layout box while loading so pages do not jump as media arrives. */
export default function LoadingImage({ frameClassName = '', className = '', onLoad, onError, ...props }: LoadingImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const imageClass = ['media-loading-image', `media-loading-image--${status}`, frameClassName, className].filter(Boolean).join(' ')

  useEffect(() => setStatus('loading'), [props.src])

  return (
    <img
      {...props}
      className={imageClass}
      data-image-state={status}
      onLoad={(event) => {
        setStatus('loaded')
        onLoad?.(event)
      }}
      onError={(event) => {
        setStatus('error')
        onError?.(event)
      }}
    />
  )
}
