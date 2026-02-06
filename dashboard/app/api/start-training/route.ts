import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function POST(req: NextRequest) {
  try {
    const { spec } = await req.json();

    if (!spec || !spec.spec) {
      return NextResponse.json(
        { error: 'Specification is required' },
        { status: 400 }
      );
    }

    // Save spec to config file that the training script will read
    const configPath = join(process.cwd(), '..', 'config', 'training_spec.json');

    await writeFile(
      configPath,
      JSON.stringify(spec.spec, null, 2),
      'utf-8'
    );

    console.log('✅ Training specification saved:', configPath);

    // In production, this would trigger the training pipeline
    // For now, we'll just return success and redirect to the stream page

    return NextResponse.json({
      success: true,
      message: 'Training specification saved. Starting training...',
      config_path: configPath
    });
  } catch (error: any) {
    console.error('Error starting training:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to start training' },
      { status: 500 }
    );
  }
}
