import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { filesAPI } from '@/services/api';
import { FileDropZone } from '@/components/common';
import './FilePanel.css';

interface FilePanelProps {
  projectId: string;
}

export default function FilePanel({ projectId }: FilePanelProps) {
  const queryClient = useQueryClient();

  // Fetch files
  const { data: filesData, isLoading } = useQuery({
    queryKey: ['files', projectId],
    queryFn: () => filesAPI.list(projectId),
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => filesAPI.upload(projectId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', projectId] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: filesAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', projectId] });
    },
  });

  const handleUpload = useCallback(async (file: File) => {
    await uploadMutation.mutateAsync(file);
  }, [uploadMutation]);

  const handleDelete = (fileId: string) => {
    if (confirm('Delete this file?')) {
      deleteMutation.mutate(fileId);
    }
  };

  const handleDownload = async (fileId: string, filename: string) => {
    try {
      const blob = await filesAPI.download(fileId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const files = filesData?.files || [];

  return (
    <div className="file-panel">
      <div className="file-panel-upload">
        <FileDropZone
          onUpload={handleUpload}
          isUploading={uploadMutation.isPending}
          compact
        />
      </div>

      <div className="file-list">
        {isLoading && <div className="file-list-empty">Loading files...</div>}

        {files.length === 0 && !isLoading && (
          <div className="file-list-empty">
            No files uploaded yet
          </div>
        )}

        {files.map((file: any) => (
          <div key={file.id} className="file-item">
            <div className="file-info">
              <div className="file-name">{file.filename}</div>
              <div className="file-meta">
                {formatFileSize(file.size)} • {file.file_type}
              </div>
            </div>
            <div className="file-actions">
              <button
                className="file-action-btn download"
                onClick={() => handleDownload(file.id, file.filename)}
                title="Download"
              >
                ↓
              </button>
              <button
                className="file-action-btn delete"
                onClick={() => handleDelete(file.id)}
                title="Delete"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
