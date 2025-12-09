/**
 * FileDropZone - Drag and drop file upload area
 *
 * A reusable component for file uploads with:
 * - Drag and drop support
 * - Click to browse
 * - Visual feedback during drag
 * - Upload progress indication
 */
import { useState, useRef, useCallback } from 'react';
import { Upload, FileUp, Loader2 } from 'lucide-react';
import './FileDropZone.css';

interface FileDropZoneProps {
  onUpload: (file: File) => Promise<void>;
  isUploading?: boolean;
  accept?: string;
  maxSize?: number; // in bytes
  className?: string;
  compact?: boolean; // compact mode for sidebars
}

export default function FileDropZone({
  onUpload,
  isUploading = false,
  accept,
  maxSize = 50 * 1024 * 1024, // 50MB default
  className = '',
  compact = false,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    if (maxSize && file.size > maxSize) {
      const maxMB = (maxSize / (1024 * 1024)).toFixed(0);
      return `File size exceeds ${maxMB}MB limit`;
    }
    return null;
  }, [maxSize]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await onUpload(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  }, [onUpload, validateFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    if (isUploading) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [isUploading, handleFile]);

  const handleClick = useCallback(() => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  }, [isUploading]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFile]);

  const formatMaxSize = () => {
    if (!maxSize) return '';
    if (maxSize >= 1024 * 1024) {
      return `Max ${(maxSize / (1024 * 1024)).toFixed(0)}MB`;
    }
    return `Max ${(maxSize / 1024).toFixed(0)}KB`;
  };

  return (
    <div
      className={`file-drop-zone ${isDragging ? 'dragging' : ''} ${isUploading ? 'uploading' : ''} ${compact ? 'compact' : ''} ${className}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <div className="drop-zone-content">
        {isUploading ? (
          <>
            <Loader2 className="drop-zone-icon spinning" size={compact ? 20 : 32} />
            <span className="drop-zone-text">Uploading...</span>
          </>
        ) : isDragging ? (
          <>
            <FileUp className="drop-zone-icon active" size={compact ? 20 : 32} />
            <span className="drop-zone-text">Drop file here</span>
          </>
        ) : (
          <>
            <Upload className="drop-zone-icon" size={compact ? 20 : 32} />
            {compact ? (
              <span className="drop-zone-text">Drop file or click to upload</span>
            ) : (
              <>
                <span className="drop-zone-text">
                  Drag and drop a file here, or click to browse
                </span>
                <span className="drop-zone-hint">{formatMaxSize()}</span>
              </>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="drop-zone-error">{error}</div>
      )}
    </div>
  );
}
