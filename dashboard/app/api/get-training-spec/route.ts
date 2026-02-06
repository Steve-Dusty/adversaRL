import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(req: NextRequest) {
  try {
    // Read the saved training spec
    const configPath = join(process.cwd(), '..', 'config', 'training_spec.json');

    const data = await readFile(configPath, 'utf-8');
    const spec = JSON.parse(data);

    return NextResponse.json({
      success: true,
      spec: spec
    });
  } catch (error: any) {
    console.error('Error loading training spec:', error);

    // Return default spec if file doesn't exist
    return NextResponse.json(
      {
        success: false,
        error: 'Training specification not found',
        spec: {
          environment_prompt: 'A robotic arm workspace: white tabletop with red cube, workshop lighting, clean industrial environment'
        }
      },
      { status: 404 }
    );
  }
}
